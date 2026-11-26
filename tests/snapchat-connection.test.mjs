// Snapchat's connection (MVP_draft.md section 84): the sign-in, the token exchange and refresh, the Public Profile call and the health check, against a fake
// platform, on the model of tests/connections2.test.mjs. The addresses were read from Snap's own pages on 2026-11-26 and the consent screen was seen on a real
// account the same day; nothing here has met Snap's API, so what Snap says when it has not allowed the app is held as the answer a 403 is taken for.
// The database half is supabase/tests/snapchat_connection_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SNAPCHAT_SCOPES, packTokens, snapProfileOf, snapchatAccountHealth, snapchatAppCheck, snapchatAuthUrl, snapchatExchangeCode, snapchatProfile, snapchatRefresh, unpackTokens } from '../src/lib/platforms/oauth2.ts';
import { PlatformCallError } from '../src/lib/platforms/oauth.ts';
import { APP_INTEGRATION_TYPE, PROVIDER_COPY, PROVIDER_NAME, providerOf } from '../src/lib/platforms/provider.ts';
import { checkAccount } from '../src/lib/platforms/connect.ts';
import { connErrorAr, KNOWLEDGE } from '../src/lib/platforms/info.ts';
import { GUIDES } from '../src/lib/setup-guides.ts';
import { plainText } from '../src/lib/guide-text.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function fake(handler) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  f.calls = calls;
  return f;
}
const NOW = Date.parse('2026-11-26T09:00:00Z');
const ID = '56b82922-e09e-459e-9c86-8cebc54019cb';
const SECRET = 'SNAPSECRETMARK-test-0000001';
const TOKEN = 'https://accounts.snapchat.com/login/oauth2/access_token';
const ALT = 'https://accounts.snapchat.com/login/oauth2/token';
const MY = 'https://businessapi.snapchat.com/v1/public_profiles/my_profile';
const PROFILE = { request_status: 'SUCCESS', public_profiles: [{ sub_request_status: 'SUCCESS', public_profile: { id: 'pf-123', display_name: 'الملف العام للقسم', snap_user_name: 'comms_dept', profile_tier: 'TIER_PUBLIC' } }] };
const form = (init) => Object.fromEntries(new URLSearchParams(String(init.body)));

test('the sign-in goes to Snap\'s authorize page with the Public Profile scope, a state and the site\'s own return address, and no secret', () => {
  const u = new URL(snapchatAuthUrl({ clientId: ID, redirectUri: 'https://comms-hub-three.vercel.app/api/platforms/callback/snapchat', state: 's1' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.snapchat.com/login/oauth2/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('client_id'), ID);
  assert.equal(u.searchParams.get('redirect_uri'), 'https://comms-hub-three.vercel.app/api/platforms/callback/snapchat');
  assert.equal(u.searchParams.get('state'), 's1');
  assert.deepEqual(u.searchParams.get('scope').split(' '), [...SNAPCHAT_SCOPES]);
  assert.deepEqual([...SNAPCHAT_SCOPES], ['snapchat-profile-api']);
  assert.doesNotMatch(u.toString(), /secret/i);
});

test('the app pair is checked by a refused code: only an explicit refusal of the client is a refusal', async () => {
  const known = fake(() => json({ error: 'invalid_grant' }, 400));
  assert.deepEqual(await snapchatAppCheck(known, ID, SECRET), { ok: true });
  assert.equal(known.calls[0].url, TOKEN);
  assert.deepEqual(form(known.calls[0].init), { grant_type: 'authorization_code', code: 'not-a-real-code', redirect_uri: 'https://localhost/', client_id: ID, client_secret: SECRET });
  assert.deepEqual(await snapchatAppCheck(fake(() => json({ error: 'invalid_client' }, 401)), ID, SECRET), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await snapchatAppCheck(fake(() => json({ error: 'unauthorized_client' }, 400)), ID, SECRET), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await snapchatAppCheck(fake(() => json({}, 503)), ID, SECRET), { ok: false, error: 'PLATFORM_DOWN' });
  assert.deepEqual(await snapchatAppCheck(fake(() => json({ error: 'invalid_request' }, 400)), ID, SECRET), { ok: true }, 'anything else says the pair is known');
});

test('the second address Snap documents for the token is tried only when the first does not exist', async () => {
  const f = fake((url) => (url === TOKEN ? json({}, 404) : json({ error: 'invalid_grant' }, 400)));
  assert.deepEqual(await snapchatAppCheck(f, ID, SECRET), { ok: true });
  assert.deepEqual(f.calls.map((c) => c.url), [TOKEN, ALT]);
  const once = fake(() => json({ error: 'invalid_grant' }, 400));
  await snapchatAppCheck(once, ID, SECRET);
  assert.equal(once.calls.length, 1, 'one call when the first answers');
});

test('a code becomes tokens: an hour for the access token, a refresh token kept, the secret only in the body to Snap', async () => {
  const f = fake(() => json({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600, token_type: 'Bearer', scope: 'snapchat-profile-api' }));
  const t = await snapchatExchangeCode(f, { clientId: ID, secret: SECRET, redirectUri: 'https://hub.test/api/platforms/callback/snapchat', code: 'c1', now: NOW });
  assert.deepEqual([t.access, t.refresh, t.scope], ['A1', 'R1', ['snapchat-profile-api']]);
  assert.equal(t.accessExpiresAt, new Date(NOW + 3600e3).toISOString());
  assert.deepEqual(form(f.calls[0].init), { grant_type: 'authorization_code', code: 'c1', redirect_uri: 'https://hub.test/api/platforms/callback/snapchat', client_id: ID, client_secret: SECRET });
  assert.equal(f.calls[0].url, TOKEN);
  assert.equal(JSON.stringify(f.calls[0].init.headers).includes(SECRET), false, 'the secret is not in a header or a URL');
  assert.equal(f.calls[0].url.includes(SECRET), false);
  await assert.rejects(snapchatExchangeCode(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: ID, secret: SECRET, redirectUri: 'x', code: 'bad', now: NOW }), (e) => e instanceof PlatformCallError && e.code === 'CODE_REFUSED');
  await assert.rejects(snapchatExchangeCode(fake(() => json({ error: 'invalid_client' }, 401)), { clientId: ID, secret: SECRET, redirectUri: 'x', code: 'c', now: NOW }), (e) => e.code === 'APP_REFUSED');
  await assert.rejects(snapchatExchangeCode(fake(() => json({ access_token: 'A', expires_in: 3600 })), { clientId: ID, secret: SECRET, redirectUri: 'x', code: 'c', now: NOW }), (e) => e.code === 'REFRESH_MISSING');
});

test('refresh keeps the old refresh token when Snap sends none, and takes a new one when it does', async () => {
  const kept = await snapchatRefresh(fake(() => json({ access_token: 'A2', expires_in: 3600 })), { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW });
  assert.deepEqual([kept.access, kept.refresh], ['A2', 'R1']);
  const rotated = await snapchatRefresh(fake(() => json({ access_token: 'A3', refresh_token: 'R2', expires_in: 3600 })), { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW });
  assert.deepEqual([rotated.access, rotated.refresh], ['A3', 'R2']);
  const f = fake(() => json({ access_token: 'A4', expires_in: 3600 }));
  await snapchatRefresh(f, { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW });
  assert.deepEqual(form(f.calls[0].init), { grant_type: 'refresh_token', refresh_token: 'R1', client_id: ID, client_secret: SECRET });
  assert.deepEqual(await snapchatRefresh(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW }), { error: 'TOKEN_REFUSED' });
  assert.deepEqual(await snapchatRefresh(fake(() => json({}, 429)), { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW }), { error: 'RATE_LIMIT' });
  assert.deepEqual(await snapchatRefresh(fake(() => json({}, 502)), { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW }), { error: 'PLATFORM_DOWN' });
});

test('the Public Profile is found by what it is, wherever Snap\'s envelope puts it', () => {
  assert.deepEqual(snapProfileOf(PROFILE), { id: 'pf-123', name: 'الملف العام للقسم', username: 'comms_dept' });
  assert.deepEqual(snapProfileOf({ id: 'p9', display_name: 'اسم' }), { id: 'p9', name: 'اسم', username: null });
  assert.deepEqual(snapProfileOf({ public_profiles: [{ public_profile: { id: 'p8', display_name: 'ن', username: 'u8' } }] }), { id: 'p8', name: 'ن', username: 'u8' });
  assert.equal(snapProfileOf({ request_status: 'SUCCESS', public_profiles: [] }), null);
  assert.equal(snapProfileOf({ id: 5, display_name: 'x' }), null, 'an id is text');
  assert.equal(snapProfileOf(null), null);
  assert.equal(snapProfileOf('text'), null);
  let deep = { id: 'p1', display_name: 'd' };
  for (let i = 0; i < 9; i++) deep = { a: deep };
  assert.equal(snapProfileOf(deep), null, 'nothing is searched without end');
});

test('whose profile the token is: asked with the token, and each refusal is a code the page can word', async () => {
  const f = fake(() => json(PROFILE));
  assert.deepEqual(await snapchatProfile(f, 'A1'), { id: 'pf-123', name: 'الملف العام للقسم', username: 'comms_dept' });
  assert.equal(f.calls[0].url, MY);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer A1');
  assert.deepEqual(await snapchatProfile(fake(() => json({}, 401)), 'A'), { error: 'TOKEN_REFUSED' });
  assert.deepEqual(await snapchatProfile(fake(() => json({ request_status: 'ERROR' }, 403)), 'A'), { error: 'ACCESS_NOT_GRANTED' }, 'what an app Snap has not allowed is expected to get');
  assert.deepEqual(await snapchatProfile(fake(() => json({}, 404)), 'A'), { error: 'NO_PROFILE' });
  assert.deepEqual(await snapchatProfile(fake(() => json({ request_status: 'SUCCESS', public_profiles: [] })), 'A'), { error: 'NO_PROFILE' });
  assert.deepEqual(await snapchatProfile(fake(() => json({}, 429)), 'A'), { error: 'RATE_LIMIT' });
  assert.deepEqual(await snapchatProfile(fake(() => json({}, 500)), 'A'), { error: 'PLATFORM_DOWN' });
  for (const code of ['ACCESS_NOT_GRANTED', 'NO_PROFILE']) assert.notEqual(connErrorAr(code), 'فشل فحص الاتصال.', `${code} has its own words`);
  assert.match(connErrorAr('ACCESS_NOT_GRANTED'), /Snap/);
  assert.match(connErrorAr('NO_PROFILE'), /ملف عام/);
});

test('health: a live token is used as it is; an ended one is refreshed and the rotated token is kept; another person\'s profile is refused', async () => {
  const live = packTokens({ access: 'A1', refresh: 'R1', subject: 'pf-123', accessExpiresAt: new Date(NOW + 30 * 60e3).toISOString(), refreshExpiresAt: new Date(NOW + 90 * 86400e3).toISOString() });
  const f = fake((url) => (url === MY ? json(PROFILE) : json({}, 500)));
  const h = await snapchatAccountHealth(f, { clientId: ID, secret: SECRET, packed: live, externalId: 'pf-123', now: NOW });
  assert.deepEqual([h.ok, h.error, h.newSecret], [true, null, null]);
  assert.equal(f.calls.length, 1, 'no refresh while the hour lasts');
  assert.equal(Date.parse(h.expiresAt) - NOW, 90 * 86400e3, 'a good check renews the rolling date');

  const ended = packTokens({ access: 'A0', refresh: 'R1', subject: 'pf-123', accessExpiresAt: new Date(NOW - 60e3).toISOString(), refreshExpiresAt: '' });
  const g = fake((url) => (url === TOKEN ? json({ access_token: 'A2', refresh_token: 'R2', expires_in: 3600 }) : json(PROFILE)));
  const r = await snapchatAccountHealth(g, { clientId: ID, secret: SECRET, packed: ended, externalId: 'pf-123', now: NOW });
  assert.equal(r.ok, true);
  const kept = unpackTokens(r.newSecret);
  assert.deepEqual([kept.access, kept.refresh, kept.subject], ['A2', 'R2', 'pf-123']);
  assert.equal(g.calls[1].init.headers.Authorization, 'Bearer A2', 'the profile is asked with the new token');

  const other = await snapchatAccountHealth(fake(() => json(PROFILE)), { clientId: ID, secret: SECRET, packed: live, externalId: 'someone-else', now: NOW });
  assert.deepEqual([other.ok, other.error], [false, 'TOKEN_REFUSED']);
  const dead = await snapchatAccountHealth(fake((url) => (url === TOKEN ? json({ error: 'invalid_grant' }, 400) : json(PROFILE))), { clientId: ID, secret: SECRET, packed: ended, externalId: 'pf-123', now: NOW });
  assert.deepEqual([dead.ok, dead.error], [false, 'TOKEN_EXPIRED']);
  const refused = await snapchatAccountHealth(fake(() => json({}, 403)), { clientId: ID, secret: SECRET, packed: live, externalId: 'pf-123', now: NOW });
  assert.deepEqual([refused.ok, refused.error], [false, 'ACCESS_NOT_GRANTED']);
  assert.deepEqual((await snapchatAccountHealth(fake(() => json(PROFILE)), { clientId: ID, secret: SECRET, packed: 'not json', externalId: null, now: NOW })).error, 'NOT_CONNECTED');
});

test('no secret reaches a result, an error or a stored value other than the vault\'s own', async () => {
  const bad = fake(() => json({ error: 'invalid_grant', error_description: SECRET }, 400));
  const e = await snapchatExchangeCode(bad, { clientId: ID, secret: SECRET, redirectUri: 'x', code: 'c', now: NOW }).catch((x) => x);
  assert.equal(String(e.message).includes('SECRETMARK') || JSON.stringify(e).includes('SECRETMARK'), false);
  const refused = await snapchatRefresh(bad, { clientId: ID, secret: SECRET, refresh: 'R1', now: NOW });
  assert.equal(JSON.stringify(refused).includes('SECRETMARK'), false);
});

test('the site\'s own sweep checks a Snapchat account with the Snapchat app, and records the answer', async () => {
  const recorded = [];
  const db = {
    rpc: async (name, args) => {
      if (name === 'platform_conn_secret') return { data: packTokens({ access: 'A1', refresh: 'R1', subject: 'pf-123', accessExpiresAt: new Date(Date.now() + 30 * 60e3).toISOString(), refreshExpiresAt: '' }), error: null };
      if (name === 'platform_conn_health') {
        recorded.push(args);
        return { data: args.p_ok ? 'connected' : 'error', error: null };
      }
      return { data: null, error: null };
    },
  };
  process.env.MAIL_SERVER_KEY = 'k-test';
  const apps = { snapchat: { id: 'i', appId: ID, secret: SECRET, scopes: null, configId: null } };
  const f = fake(() => json(PROFILE));
  const res = await checkAccount(db, f, apps, { id: 'acc-1', platform: 'snapchat', type: 'snapchat_profile', integration: 'int-1', external_id: 'pf-123' });
  assert.equal(res.state, 'connected');
  assert.equal(f.calls.at(-1).url, MY);
  assert.deepEqual([recorded[0].p_ok, recorded[0].p_error], [true, null]);
  const no = await checkAccount(db, fake(() => json({}, 403)), apps, { id: 'acc-1', platform: 'snapchat', type: 'snapchat_profile', integration: 'int-1', external_id: 'pf-123' });
  assert.equal(no.error, 'ACCESS_NOT_GRANTED');
  const none = await checkAccount(db, f, {}, { id: 'acc-1', platform: 'snapchat', type: 'snapchat_profile', integration: 'int-1', external_id: 'pf-123' });
  assert.equal(none.error, 'APP_NOT_CONFIGURED');
});

test('the client and the server agree: the provider, its app, its words and where its two values are found', () => {
  assert.equal(providerOf('snapchat'), 'snapchat');
  assert.equal(APP_INTEGRATION_TYPE.snapchat, 'snapchat_app');
  assert.equal(PROVIDER_NAME.snapchat, 'Snapchat');
  assert.match(PROVIDER_COPY.snapchat.where, /business\.snapchat\.com/);
  assert.match(PROVIDER_COPY.snapchat.where, /OAuth apps/);
});

test('the guide: the order of what the owner walked, the redirect address from the site, the secret hidden, the allowlist a review that holds nothing back', () => {
  const g = GUIDES.snapchat;
  assert.deepEqual(g.steps.map((s) => s.id), ['account', 'business', 'profile', 'dashboard', 'oauth', 'form', 'secret', 'keys', 'allowlist']);
  assert.deepEqual(g.steps.filter((s) => s.kind === 'keys').map((s) => s.id), ['keys']);
  assert.equal(g.steps.find((s) => s.id === 'allowlist').kind, 'review');
  assert.equal(g.steps.find((s) => s.id === 'form').copy, '{redirect}', 'the redirect address is filled in from the site');
  for (const s of g.steps.filter((x) => x.kind !== 'keys' && x.kind !== 'review')) assert.equal(s.implied, true, `${s.id}: a stored secret proves it`);
  const all = JSON.stringify(g);
  assert.match(all, /kit\.snapchat\.com/, 'the Developer Portal is named as the wrong place');
  assert.match(all, /Business details/);
  assert.match(all, /Snap redirect URIs/);
  assert.match(all, /غطِّ السر/);
  assert.match(JSON.stringify(g.notes), /محاكاة|يدوياً/);
  assert.match(JSON.stringify(g.notes), /2026-11-26/);
  assert.doesNotMatch(all, /56b82922|SECRETMARK|65d5f482/, 'no id or secret of a real app is in the guide');
  assert.doesNotMatch(all, /\p{Extended_Pictographic}/u);
  const request = g.steps.find((s) => s.id === 'allowlist').copy;
  assert.match(request, /client ID/);
  assert.match(request, /not shared the client secret/);
  assert.ok(plainText(g.steps[1].todo.join(' ')).includes('Business name'));
  const c = GUIDES.connect_snapchat;
  assert.ok(c.steps.length >= 4 && /محاكاة/.test(JSON.stringify(c.notes)));
});

test('what the site says about Snapchat is the same on the card, in the guide and in the code', () => {
  const k = KNOWLEDGE.snapchat;
  assert.equal(k.checked, '2026-11-26');
  assert.match(k.cannot, /allowlist/);
  assert.match(k.cannot, /يدوياً/);
  assert.match(k.docs, /Public-Profile-API/);
  assert.ok(k.requires.some((r) => /Business details/.test(r)));
});

test('the migration widens exactly the lists the code uses, from each function\'s own definition, and can be run again', () => {
  const sql = readFileSync('supabase/migrations/20261126150000_snapchat_connection.sql', 'utf8');
  for (const t of ['snapchat_app', 'snapchat_user_offer', 'snapchat_profile']) assert.ok(sql.includes(`''${t}''`), t);
  assert.match(sql, /MIGRATION_ASSUMPTION/);
  assert.match(sql, /d like '%snapchat%'/, 'a function already widened is left as it is');
  assert.match(sql, /patched <> 9/);
  assert.match(sql, /when ''snapchat'' then v_app := ''snapchat_app''/);
});

// Action_Plan.md B9: YouTube (Google), LinkedIn and X connect and are checked on the same model as
// Meta and TikTok, against a fake platform. The database half (rights, vault, linking) is
// supabase/tests/connections_generalised_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOOGLE_SCOPES,
  LINKEDIN_SCOPES,
  X_SCOPES,
  ROLLING_DAYS,
  googleAccountHealth,
  googleAppCheck,
  googleAuthUrl,
  googleChannels,
  googleExchangeCode,
  googleRefresh,
  linkedinAccountHealth,
  linkedinAppCheck,
  linkedinAuthUrl,
  linkedinExchangeCode,
  linkedinUserInfo,
  packTokens,
  pkcePair,
  unpackTokens,
  xAccountHealth,
  xAppCheck,
  xAuthUrl,
  xExchangeCode,
  xMe,
  xRefresh,
} from '../src/lib/platforms/oauth2.ts';
import { ACCOUNT_TYPE, APP_TYPE, OFFER_TYPE, PROVIDER_OF_TYPE, PlatformCallError } from '../src/lib/platforms/oauth.ts';
import { providerOf, APP_INTEGRATION_TYPE, CONN_PROVIDERS, PROVIDER_NAME } from '../src/lib/platforms/provider.ts';
import { connErrorAr } from '../src/lib/platforms/info.ts';
import { GUIDES } from '../src/lib/setup-guides.ts';

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
const NOW = Date.parse('2026-10-15T09:00:00Z');
const DAY = 86400e3;
const SECRET = 'client-secret-0123456789';

// ---- the map ---------------------------------------------------------------------------------------
test('five providers, and every registry platform that connects names its account type', () => {
  assert.deepEqual([...CONN_PROVIDERS], ['meta', 'tiktok', 'google', 'linkedin', 'x']);
  assert.deepEqual(Object.keys(ACCOUNT_TYPE).sort(), ['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube']);
  assert.equal(providerOf('youtube'), 'google');
  assert.equal(providerOf('linkedin'), 'linkedin');
  assert.equal(providerOf('x'), 'x');
  assert.equal(providerOf('snapchat'), null, 'Snapchat stays a manual task');
  for (const p of CONN_PROVIDERS) {
    assert.ok(PROVIDER_NAME[p], p);
    assert.equal(APP_INTEGRATION_TYPE[p], APP_TYPE[p], `${p}: the client and the server agree on the app type`);
    assert.match(OFFER_TYPE[p], /_user_offer$|^meta_user$/, p);
  }
  for (const [platform, a] of Object.entries(ACCOUNT_TYPE)) assert.equal(PROVIDER_OF_TYPE[a.type], a.provider, platform);
});

test('the migration lists exactly the types the code uses', () => {
  const sql = readFileSync('supabase/migrations/20261015190000_connections_generalised.sql', 'utf8');
  for (const t of [...Object.values(APP_TYPE), ...Object.values(OFFER_TYPE), ...Object.values(ACCOUNT_TYPE).map((a) => a.type)]) {
    if (['meta_app', 'tiktok_app', 'meta_user', 'tiktok_user_offer', 'meta_page', 'meta_instagram', 'tiktok_user'].includes(t)) continue;
    assert.ok(sql.includes(`''${t}''`), t);
  }
});

// ---- Google ------------------------------------------------------------------------------------------
test('Google: the sign-in asks for upload and channel read access offline, with a state and a fresh consent', () => {
  const u = new URL(googleAuthUrl({ clientId: 'cid.apps.googleusercontent.com', redirectUri: 'https://hub.test/api/platforms/callback/google', state: 's1' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('state'), 's1');
  assert.deepEqual(u.searchParams.get('scope').split(' '), [...GOOGLE_SCOPES]);
  assert.ok(GOOGLE_SCOPES.some((s) => s.endsWith('/youtube.upload')));
});

test('Google: the app pair is checked by a refused code, and a refused client is the only refusal', async () => {
  const known = fake(() => json({ error: 'invalid_grant' }, 400));
  assert.deepEqual(await googleAppCheck(known, 'cid', SECRET), { ok: true });
  assert.match(known.calls[0].init.body, /client_secret=client-secret/);
  assert.deepEqual(await googleAppCheck(fake(() => json({ error: 'invalid_client' }, 401)), 'cid', 'wrong'), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await googleAppCheck(fake(() => json({}, 503)), 'cid', SECRET), { ok: false, error: 'PLATFORM_DOWN' });
  await assert.rejects(googleAppCheck(async () => { throw new Error('offline'); }, 'cid', SECRET), (e) => e instanceof PlatformCallError && e.code === 'UNREACHABLE');
});

test('Google: the code becomes an access and a refresh token; no refresh token is a named failure', async () => {
  const f = fake((url, init) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.match(init.body, /grant_type=authorization_code/);
    return json({ access_token: 'ya29.A', refresh_token: '1//R', expires_in: 3599, scope: GOOGLE_SCOPES.join(' ') });
  });
  const t = await googleExchangeCode(f, { clientId: 'cid', secret: SECRET, redirectUri: 'https://hub.test/cb', code: 'c', now: NOW });
  assert.equal(t.access, 'ya29.A');
  assert.equal(t.refresh, '1//R');
  assert.equal(t.accessExpiresAt, new Date(NOW + 3599e3).toISOString());
  assert.equal(t.refreshExpiresAt, new Date(NOW + ROLLING_DAYS * DAY).toISOString());
  assert.deepEqual(t.scope, [...GOOGLE_SCOPES]);
  await assert.rejects(
    googleExchangeCode(fake(() => json({ access_token: 'x', expires_in: 3600 })), { clientId: 'c', secret: SECRET, redirectUri: 'r', code: 'c' }),
    (e) => e.code === 'REFRESH_MISSING',
  );
  await assert.rejects(googleExchangeCode(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: 'c', secret: SECRET, redirectUri: 'r', code: 'c' }), (e) => e.code === 'CODE_REFUSED');
  assert.match(connErrorAr('REFRESH_MISSING'), /رمز/);
});

test('Google: the channels the person owns, and the answers that mean the token is gone', async () => {
  const f = fake((url) => {
    assert.match(url, /^https:\/\/www\.googleapis\.com\/youtube\/v3\/channels\?/);
    assert.match(url, /mine=true/);
    return json({ items: [{ id: 'UC1', snippet: { title: 'قناة القسم', customUrl: '@comms' } }, { id: 'UC2', snippet: { title: 'ثانية' } }] });
  });
  assert.deepEqual(await googleChannels(f, 'tok'), [
    { id: 'UC1', title: 'قناة القسم', handle: '@comms' },
    { id: 'UC2', title: 'ثانية', handle: null },
  ]);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(await googleChannels(fake(() => json({}, 401)), 't'), { error: 'TOKEN_REFUSED' });
  assert.deepEqual(await googleChannels(fake(() => json({}, 403)), 't'), { error: 'PERMISSION_REVOKED' });
});

test('Google: health refreshes an ended access token, keeps the refresh token, and the end date rolls', async () => {
  const packed = packTokens({ access: 'old', refresh: '1//R', subject: '', accessExpiresAt: new Date(NOW - 1000).toISOString(), refreshExpiresAt: new Date(NOW + DAY).toISOString() });
  const f = fake((url) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'new', expires_in: 3600 });
    return json({ items: [{ id: 'UC1', snippet: { title: 't' } }] });
  });
  const h = await googleAccountHealth(f, { clientId: 'cid', secret: SECRET, packed, externalId: 'UC1', now: NOW });
  assert.equal(h.ok, true);
  assert.equal(h.expiresAt, new Date(NOW + ROLLING_DAYS * DAY).toISOString());
  const stored = unpackTokens(h.newSecret);
  assert.equal(stored.access, 'new');
  assert.equal(stored.refresh, '1//R');
  // A token still valid is not refreshed.
  const fresh = packTokens({ access: 'a', refresh: 'r', subject: '', accessExpiresAt: new Date(NOW + 3600e3).toISOString(), refreshExpiresAt: '' });
  const g = fake(() => json({ items: [{ id: 'UC1', snippet: {} }] }));
  const h2 = await googleAccountHealth(g, { clientId: 'cid', secret: SECRET, packed: fresh, externalId: 'UC1', now: NOW });
  assert.equal(h2.newSecret, null);
  assert.equal(g.calls.length, 1);
  // Revoked, or the app in testing whose refresh token lived its days.
  const dead = await googleAccountHealth(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: 'cid', secret: SECRET, packed, externalId: 'UC1', now: NOW });
  assert.deepEqual([dead.ok, dead.error], [false, 'TOKEN_EXPIRED']);
  // The channel is no longer the person's.
  const gone = await googleAccountHealth(fake(() => json({ items: [{ id: 'UC9', snippet: {} }] })), { clientId: 'cid', secret: SECRET, packed: fresh, externalId: 'UC1', now: NOW });
  assert.equal(gone.error, 'PERMISSION_REVOKED');
  assert.equal((await googleAccountHealth(f, { clientId: 'c', secret: SECRET, packed: 'not json', externalId: null })).error, 'NOT_CONNECTED');
  assert.deepEqual(await googleRefresh(fake(() => json({}, 500)), { clientId: 'c', secret: SECRET, refresh: 'r' }), { error: 'PLATFORM_DOWN' });
});

// ---- LinkedIn ------------------------------------------------------------------------------------------
test('LinkedIn: the sign-in asks for the profile and for posting as the member, scopes space-separated and encoded', () => {
  const url = linkedinAuthUrl({ clientId: '77abc', redirectUri: 'https://hub.test/api/platforms/callback/linkedin', state: 's2' });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.deepEqual(u.searchParams.get('scope').split(' '), [...LINKEDIN_SCOPES]);
  assert.match(url, /scope=openid%20profile%20w_member_social/);
  assert.ok(LINKEDIN_SCOPES.includes('w_member_social'));
});

test('LinkedIn: the pair is checked, the code gives a 60-day token with no refresh token, who it is comes from userinfo', async () => {
  assert.deepEqual(await linkedinAppCheck(fake(() => json({ error: 'invalid_request' }, 400)), '77abc', SECRET), { ok: true });
  assert.deepEqual(await linkedinAppCheck(fake(() => json({ error: 'invalid_client' }, 401)), '77abc', 'x'), { ok: false, error: 'APP_REFUSED' });
  const f = fake((url, init) => {
    assert.equal(url, 'https://www.linkedin.com/oauth/v2/accessToken');
    assert.match(init.body, /client_secret=client-secret/);
    return json({ access_token: 'AQV', expires_in: 5184000, scope: 'openid,profile,w_member_social' });
  });
  const t = await linkedinExchangeCode(f, { clientId: '77abc', secret: SECRET, redirectUri: 'https://hub.test/cb', code: 'c', now: NOW });
  assert.equal(t.accessExpiresAt, new Date(NOW + 60 * DAY).toISOString());
  assert.equal(t.refresh, '');
  assert.deepEqual(t.scope, ['openid', 'profile', 'w_member_social']);
  const me = await linkedinUserInfo(fake((url) => (assert.equal(url, 'https://api.linkedin.com/v2/userinfo'), json({ sub: 'abc123', name: 'مدير الاتصال', picture: 'https://p/x.jpg' }))), 'AQV');
  assert.deepEqual(me, { sub: 'abc123', name: 'مدير الاتصال', picture: 'https://p/x.jpg' });
  assert.deepEqual(await linkedinUserInfo(fake(() => json({}, 401)), 't'), { error: 'TOKEN_REFUSED' });
});

test('LinkedIn: health needs no refresh: the end date is the token\'s own, and it must be the same member', async () => {
  const packed = packTokens({ access: 'AQV', refresh: '', subject: 'abc123', accessExpiresAt: new Date(NOW + 20 * DAY).toISOString(), refreshExpiresAt: '' });
  const ok = await linkedinAccountHealth(fake(() => json({ sub: 'abc123', name: 'n' })), { packed, externalId: 'abc123', now: NOW });
  assert.deepEqual([ok.ok, ok.expiresAt], [true, new Date(NOW + 20 * DAY).toISOString()]);
  assert.equal((await linkedinAccountHealth(fake(() => json({ sub: 'other' })), { packed, externalId: 'abc123', now: NOW })).error, 'TOKEN_REFUSED');
  const ended = packTokens({ access: 'AQV', refresh: '', subject: 'abc123', accessExpiresAt: new Date(NOW - 1).toISOString(), refreshExpiresAt: '' });
  const f = fake(() => json({}));
  assert.equal((await linkedinAccountHealth(f, { packed: ended, externalId: 'abc123', now: NOW })).error, 'TOKEN_EXPIRED');
  assert.equal(f.calls.length, 0, 'an ended token is not sent anywhere');
});

// ---- X --------------------------------------------------------------------------------------------------
test('X: PKCE, the challenge is the S256 of a verifier that never leaves the server', async () => {
  const { verifier, challenge } = await pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  const digest = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(challenge, digest);
  const u = new URL(xAuthUrl({ clientId: 'xid', redirectUri: 'https://hub.test/api/platforms/callback/x', state: 's3', challenge }));
  assert.equal(u.origin + u.pathname, 'https://x.com/i/oauth2/authorize');
  assert.equal(u.searchParams.get('code_challenge'), challenge);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.doesNotMatch(u.toString(), new RegExp(verifier));
  assert.deepEqual(u.searchParams.get('scope').split(' '), [...X_SCOPES]);
  assert.ok(X_SCOPES.includes('offline.access') && X_SCOPES.includes('tweet.write'));
});

test('X: the pair is checked with Basic auth; the code and the verifier become tokens; refresh rotates the refresh token', async () => {
  const seen = [];
  const f = fake((url, init) => {
    seen.push(init);
    assert.equal(url, 'https://api.x.com/2/oauth2/token');
    const body = new URLSearchParams(init.body);
    if (body.get('grant_type') === 'authorization_code' && body.get('code') !== 'good') return json({ error: 'invalid_request' }, 400);
    if (body.get('grant_type') === 'authorization_code') return json({ access_token: 'A1', refresh_token: 'R1', expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access' });
    return json({ access_token: 'A2', refresh_token: 'R2', expires_in: 7200 });
  });
  assert.deepEqual(await xAppCheck(f, 'xid', SECRET), { ok: true });
  assert.equal(seen[0].headers.Authorization, `Basic ${Buffer.from(`xid:${SECRET}`).toString('base64')}`);
  assert.deepEqual(await xAppCheck(fake(() => json({}, 401)), 'xid', 'bad'), { ok: false, error: 'APP_REFUSED' });
  const t = await xExchangeCode(f, { clientId: 'xid', secret: SECRET, redirectUri: 'https://hub.test/cb', code: 'good', verifier: 'v'.repeat(43), now: NOW });
  assert.equal(new URLSearchParams(seen.at(-1).body).get('code_verifier'), 'v'.repeat(43));
  assert.equal(t.access, 'A1');
  assert.equal(t.refresh, 'R1');
  assert.equal(t.accessExpiresAt, new Date(NOW + 7200e3).toISOString());
  const r = await xRefresh(f, { clientId: 'xid', secret: SECRET, refresh: 'R1', now: NOW });
  assert.equal(r.refresh, 'R2');
  await assert.rejects(xExchangeCode(f, { clientId: 'xid', secret: SECRET, redirectUri: 'r', code: 'bad', verifier: 'v'.repeat(43) }), (e) => e.code === 'CODE_REFUSED');
  await assert.rejects(
    xExchangeCode(fake(() => json({ access_token: 'A' })), { clientId: 'xid', secret: SECRET, redirectUri: 'r', code: 'good', verifier: 'v'.repeat(43) }),
    (e) => e.code === 'REFRESH_MISSING',
  );
});

test('X: who the token belongs to, and health that refreshes the two-hour token and stores the rotated one', async () => {
  assert.deepEqual(await xMe(fake((url) => (assert.equal(url, 'https://api.x.com/2/users/me'), json({ data: { id: '999', name: 'القسم', username: 'commshub' } }))), 'A'), { id: '999', name: 'القسم', username: 'commshub' });
  assert.deepEqual(await xMe(fake(() => json({}, 401)), 'A'), { error: 'TOKEN_REFUSED' });
  const packed = packTokens({ access: 'A1', refresh: 'R1', subject: '999', accessExpiresAt: new Date(NOW - 5).toISOString(), refreshExpiresAt: '' });
  const f = fake((url) => (url.includes('oauth2/token') ? json({ access_token: 'A2', refresh_token: 'R2', expires_in: 7200 }) : json({ data: { id: '999', name: 'n', username: 'u' } })));
  const h = await xAccountHealth(f, { clientId: 'xid', secret: SECRET, packed, externalId: '999', now: NOW });
  assert.equal(h.ok, true);
  const st = unpackTokens(h.newSecret);
  assert.deepEqual([st.access, st.refresh], ['A2', 'R2']);
  assert.equal(h.expiresAt, new Date(NOW + ROLLING_DAYS * DAY).toISOString());
  const other = await xAccountHealth(fake((url) => (url.includes('oauth2/token') ? json({ access_token: 'A2', refresh_token: 'R2', expires_in: 7200 }) : json({ data: { id: '1', username: 'u' } }))), { clientId: 'xid', secret: SECRET, packed, externalId: '999', now: NOW });
  assert.equal(other.error, 'TOKEN_REFUSED');
  const dead = await xAccountHealth(fake(() => json({ error: 'invalid_grant' }, 400)), { clientId: 'xid', secret: SECRET, packed, externalId: '999', now: NOW });
  assert.equal(dead.error, 'TOKEN_EXPIRED');
});

// ---- what must hold for all of them --------------------------------------------------------------------
test('tokens go only to the platform they belong to, and no response body is ever in an error', async () => {
  const f = fake(() => json({ access_token: 'SECRET-TOKEN-BODY', error: 'invalid_grant', error_description: 'SECRET-TOKEN-BODY' }, 400));
  for (const run of [
    () => googleExchangeCode(f, { clientId: 'c', secret: SECRET, redirectUri: 'r', code: 'c' }),
    () => linkedinExchangeCode(f, { clientId: 'c', secret: SECRET, redirectUri: 'r', code: 'c' }),
    () => xExchangeCode(f, { clientId: 'c', secret: SECRET, redirectUri: 'r', code: 'c', verifier: 'v'.repeat(43) }),
  ]) {
    await assert.rejects(run(), (e) => e instanceof PlatformCallError && !String(e.message).includes('SECRET-TOKEN-BODY') && /^[A-Z_]+$/.test(e.code));
  }
  const hosts = new Set(f.calls.map((c) => new URL(c.url).host));
  assert.deepEqual([...hosts].sort(), ['api.x.com', 'oauth2.googleapis.com', 'www.linkedin.com']);
});

test('the three provider files never log, and the routes never put a token in a URL or a response', () => {
  const walk = (d) => readdirSync(d).flatMap((x) => (statSync(join(d, x)).isDirectory() ? walk(join(d, x)) : [join(d, x)]));
  const files = ['src/lib/platforms/oauth2.ts', ...walk('src/app/api/platforms').filter((f) => /\.ts$/.test(f))];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /console\.(log|info|warn|error)/, f);
  const cb = readFileSync('src/app/api/platforms/callback/[provider]/route.ts', 'utf8');
  assert.doesNotMatch(cb, /searchParams\.set\(['"](token|access|secret)/);
  assert.match(cb, /platform_oauth_pkce/);
});

test('every new provider has its app guide and its connect guide, with the return address and a link to the console', () => {
  for (const k of ['google', 'linkedin', 'x', 'connect_google', 'connect_linkedin', 'connect_x', 'mail', 'drive'])
    assert.ok(GUIDES[k], k);
  for (const k of ['google', 'linkedin', 'x']) {
    assert.ok(GUIDES[k].steps.some((s) => s.copy === '{redirect}'), `${k}: the return address to copy`);
    assert.match(GUIDES[k].link.href, /^https:\/\//, k);
    assert.match(JSON.stringify(GUIDES[k].notes), /محاكاة/, k);
  }
});

// ---- the mailbox and Drive, entered in the site ----------------------------------------------------------
import { testMailbox } from '../src/lib/mail/gmail.ts';

test('the mailbox is logged in to before it is kept, and the answer is a code, not Gmail\'s words', async () => {
  const seen = [];
  const ok = await testMailbox('dept@example.com', 'abcd efgh ijkl mnop', (a, p) => {
    seen.push([a, p]);
    return { connect: async () => undefined, logout: async () => undefined };
  });
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(seen, [['dept@example.com', 'abcdefghijklmnop']], 'the spaces of a pasted app password are dropped');
  const refused = await testMailbox('a@b.co', 'x'.repeat(16), () => ({
    connect: async () => {
      throw Object.assign(new Error('Command failed'), { authenticationFailed: true, responseText: 'secret details' });
    },
    logout: async () => undefined,
  }));
  assert.deepEqual(refused, { ok: false, error: 'MAIL_AUTH_REFUSED' });
  const down = await testMailbox('a@b.co', 'x'.repeat(16), () => ({
    connect: async () => {
      throw new Error('getaddrinfo ENOTFOUND imap.gmail.com');
    },
    logout: async () => undefined,
  }));
  assert.deepEqual(down, { ok: false, error: 'MAIL_UNREACHABLE' });
});

test('the site\'s own values win over the environment for Drive and the mailbox, and the routes ask the capability', () => {
  const g = readFileSync('src/lib/drive/google.ts', 'utf8');
  assert.match(g, /integrationCreds\('google_app'/);
  assert.match(g, /source: 'vault'/);
  const m = readFileSync('src/lib/mail/gmail.ts', 'utf8');
  assert.match(m, /integrationCreds\('gmail_account'/);
  for (const f of ['src/app/api/drive/connect/route.ts', 'src/app/api/drive/callback/route.ts'])
    assert.match(readFileSync(f, 'utf8'), /capGuard\(request, 'storage\.manage'/, f);
  assert.doesNotMatch(readFileSync('src/app/api/drive/connect/route.ts', 'utf8'), /admin: true/);
  const acct = readFileSync('src/app/api/mail/account/route.ts', 'utf8');
  assert.match(acct, /testMailbox\(address, password\)/);
  assert.match(acct, /settings\.manage[\s\S]*integrations\.secrets/);
  assert.doesNotMatch(acct, /console\./);
  // the mailbox form is write-only: nothing the route returns carries the password
  assert.doesNotMatch(acct.slice(acct.indexOf('return json')), /password/);
});

test('the WhatsApp bridge key is made in the site, kept in the vault, shown once, and the old way still answers', () => {
  const route = readFileSync('src/app/api/whatsapp/bridge-key/route.ts', 'utf8');
  assert.match(route, /randomBytes\(32\)/);
  assert.match(route, /whatsapp\.system\.manage[\s\S]*integrations\.secrets/);
  assert.match(route, /sha256Hex\(key\)/, 'the database gets the fingerprint, never the key');
  assert.doesNotMatch(route, /console\./);
  const server = readFileSync('src/lib/whatsapp/server.ts', 'utf8');
  assert.match(server, /integrationCreds\('whatsapp_bridge'/);
  assert.match(server, /return base;/, 'the environment is the fallback');
  for (const f of ['src/app/api/whatsapp/code/route.ts', 'src/app/api/whatsapp/dispatch/route.ts', 'src/app/w/[token]/route.ts'])
    assert.match(readFileSync(f, 'utf8'), /resolveWaEnv/, f);
  const panel = readFileSync('src/components/whatsapp/system-panel.tsx', 'utf8');
  assert.match(panel, /api\/whatsapp\/bridge-key/);
  assert.match(panel, /setShown\(null\)/, 'the key is dropped from the page on close');
  assert.ok(GUIDES.whatsapp && GUIDES.whatsapp.steps.length >= 6);
  assert.match(GUIDES.whatsapp.link.href, /^https:\/\//);
});

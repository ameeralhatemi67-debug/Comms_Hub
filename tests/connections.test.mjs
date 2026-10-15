// Readiness audit step 6: the platforms' own sign-in and health, against a fake platform. The
// database half (who may connect, the vault, health, delete) is
// supabase/tests/platform_connections_rules.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GRAPH_VERSION,
  META_SCOPES,
  PlatformCallError,
  TIKTOK_SCOPES,
  metaAccountHealth,
  metaAppCheck,
  metaAuthUrl,
  metaDebugToken,
  metaErrorCode,
  metaLongLivedUserToken,
  metaPages,
  packTikTok,
  tiktokAccountHealth,
  tiktokAppCheck,
  tiktokAuthUrl,
  tiktokExchangeCode,
  tiktokRefresh,
  tiktokUserInfo,
  unpackTikTok,
  providerOf,
  ACCOUNT_TYPE,
} from '../src/lib/platforms/oauth.ts';
import { providerOf as clientProviderOf } from '../src/lib/platforms/provider.ts';
import { connErrorAr, CONN_ERROR_AR } from '../src/lib/platforms/info.ts';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** A fake platform: answers by a function of the URL, and remembers every call. */
function fake(handler) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  };
  f.calls = calls;
  return f;
}
const SECRET = 'sekrit-app-secret-0123456789';
const TOKEN = 'EAAtokentokentokentoken';

test('the Meta sign-in asks for the pages and Instagram permissions, on the documented version, with a state', () => {
  assert.match(GRAPH_VERSION, /^v\d+\.\d$/);
  const u = new URL(metaAuthUrl({ appId: '123456', redirectUri: 'https://hub.test/api/platforms/callback/meta', state: 'st-1' }));
  assert.equal(u.origin + u.pathname, `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  assert.equal(u.searchParams.get('client_id'), '123456');
  assert.equal(u.searchParams.get('state'), 'st-1');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.deepEqual(u.searchParams.get('scope').split(','), [...META_SCOPES]);
  assert.ok(META_SCOPES.includes('pages_manage_posts') && META_SCOPES.includes('instagram_content_publish'));
});

test('the code becomes a long-lived user token in two steps, and the secret travels only to Meta', async () => {
  const f = fake((url) => {
    if (url.includes('code=')) return json({ access_token: 'short-token-value', expires_in: 3600 });
    if (url.includes('fb_exchange_token=short-token-value')) return json({ access_token: TOKEN, expires_in: 5184000 });
    return json({ error: { code: 1 } }, 500);
  });
  const t = await metaLongLivedUserToken(f, { appId: '1', secret: SECRET, redirectUri: 'https://hub.test/cb', code: 'CODE' });
  assert.equal(t.token, TOKEN);
  assert.ok(Date.parse(t.expiresAt) > Date.now() + 50 * 864e5);
  assert.equal(f.calls.length, 2);
  for (const c of f.calls) assert.ok(c.url.startsWith(`https://graph.facebook.com/${GRAPH_VERSION}/`), c.url);
});

test('a refused code or exchange is a short code, and no error carries a token or the secret', async () => {
  const f = fake(() => json({ error: { message: `bad ${TOKEN} ${SECRET}`, code: 100 } }, 400));
  await assert.rejects(
    () => metaLongLivedUserToken(f, { appId: '1', secret: SECRET, redirectUri: 'https://x', code: 'c' }),
    (e) => e instanceof PlatformCallError && e.code === 'CODE_REFUSED' && !e.message.includes(TOKEN) && !e.message.includes(SECRET),
  );
});

test('an app id and secret that do not match are refused before anything is stored', async () => {
  assert.deepEqual(await metaAppCheck(fake(() => json({ access_token: 'app|tok' })), '1', SECRET), { ok: true });
  assert.deepEqual(await metaAppCheck(fake(() => json({ error: { code: 1 } }, 400)), '1', SECRET), { ok: false, error: 'APP_REFUSED' });
  assert.deepEqual(await tiktokAppCheck(fake(() => json({ access_token: 'clt.x' })), 'k', SECRET), { ok: true });
  assert.deepEqual(await tiktokAppCheck(fake(() => json({ error: 'invalid_client' }, 401)), 'k', SECRET), { ok: false, error: 'APP_REFUSED' });
});

test('pages come with their own token and the Instagram account linked to each, across pages of results', async () => {
  const next = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?after=2`;
  const f = fake((url) =>
    url.includes('after=2')
      ? json({ data: [{ id: 'P2', name: 'صفحة ثانية', access_token: 'ptok2', tasks: ['MANAGE'] }] })
      : json({
          data: [
            { id: 'P1', name: 'الصفحة الرسمية', username: 'official', access_token: 'ptok1', tasks: ['CREATE_CONTENT'], instagram_business_account: { id: 'IG1', username: 'official_ig' } },
            { id: 'bad', name: 'x' },
          ],
          paging: { next },
        }),
  );
  const pages = await metaPages(f, TOKEN);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].instagram, { id: 'IG1', username: 'official_ig' });
  assert.equal(pages[0].token, 'ptok1');
  assert.equal(pages[1].instagram, null);
  // A paging link to another host is not followed.
  const f2 = fake(() => json({ data: [], paging: { next: 'https://evil.test/x' } }));
  await metaPages(f2, TOKEN);
  assert.equal(f2.calls.length, 1);
});

test('Meta errors become the codes the interface words', () => {
  assert.equal(metaErrorCode({ error: { code: 190 } }), 'TOKEN_REFUSED');
  assert.equal(metaErrorCode({ error: { code: 190, error_subcode: 463 } }), 'TOKEN_EXPIRED');
  assert.equal(metaErrorCode({ error: { code: 200 } }), 'PERMISSION_REVOKED');
  assert.equal(metaErrorCode({ error: { code: 4 } }), 'RATE_LIMIT');
  assert.equal(metaErrorCode({ error: { code: 80001 } }), 'RATE_LIMIT');
  assert.equal(metaErrorCode({}, 503), 'PLATFORM_DOWN');
  assert.equal(metaErrorCode({ error: { code: 999 } }, 400), 'PLATFORM_ERROR');
  for (const c of ['TOKEN_REFUSED', 'TOKEN_EXPIRED', 'PERMISSION_REVOKED', 'RATE_LIMIT', 'PLATFORM_DOWN', 'PLATFORM_ERROR', 'UNREACHABLE', 'APP_NOT_CONFIGURED', 'APP_REFUSED', 'CODE_REFUSED', 'NOT_CONNECTED', 'DISCONNECTED']) {
    assert.ok(CONN_ERROR_AR[c], c);
  }
  assert.equal(connErrorAr(null), '');
});

test('debug_token: the nearer of the token end and the data-access end is the authorisation', async () => {
  const soon = Math.floor(Date.now() / 1000) + 30 * 86400;
  const later = soon + 60 * 86400;
  const f = fake(() => json({ data: { is_valid: true, expires_at: later, data_access_expires_at: soon, scopes: ['pages_manage_posts'], user_id: 'U' } }));
  const i = await metaDebugToken(f, '1', SECRET, TOKEN);
  assert.equal(i.valid, true);
  assert.equal(Date.parse(i.expiresAt), soon * 1000);
  // A page token that never ends reports 0 for expires_at.
  const never = await metaDebugToken(fake(() => json({ data: { is_valid: true, expires_at: 0, data_access_expires_at: soon } })), '1', SECRET, TOKEN);
  assert.equal(Date.parse(never.expiresAt), soon * 1000);
  const none = await metaDebugToken(fake(() => json({ data: { is_valid: true, expires_at: 0, data_access_expires_at: 0 } })), '1', SECRET, TOKEN);
  assert.equal(none.expiresAt, null);
  // The app token is the id and secret joined, and travels only as the query of this call.
  assert.ok(f.calls[0].url.includes(encodeURIComponent('1|' + SECRET)));
  const bad = await metaDebugToken(fake(() => json({ data: { is_valid: false, error: { code: 190 } } })), '1', SECRET, TOKEN);
  assert.equal(bad.valid, false);
  assert.equal(bad.error, 'TOKEN_REFUSED');
});

test('a page health check: the object answers and the token is valid, else the reason as a code', async () => {
  const ok = fake((url) => (url.includes('/debug_token') ? json({ data: { is_valid: true, expires_at: 0, data_access_expires_at: Math.floor(Date.now() / 1000) + 86400, scopes: ['pages_manage_posts'] } }) : json({ id: 'P1', name: 'x' })));
  const h = await metaAccountHealth(ok, { appId: '1', secret: SECRET, objectId: 'P1', token: TOKEN, instagram: false });
  assert.equal(h.ok, true);
  assert.ok(h.expiresAt);
  assert.ok(ok.calls[0].url.includes('/P1?'));
  const revoked = fake(() => json({ error: { code: 190, error_subcode: 460 } }, 400));
  const r = await metaAccountHealth(revoked, { appId: '1', secret: SECRET, objectId: 'P1', token: TOKEN, instagram: false });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'TOKEN_REFUSED');
  const ig = fake((url) => (url.includes('/debug_token') ? json({ data: { is_valid: true, expires_at: 0, data_access_expires_at: 0 } }) : json({ id: 'IG1', username: 'u' })));
  await metaAccountHealth(ig, { appId: '1', secret: SECRET, objectId: 'IG1', token: TOKEN, instagram: true });
  assert.ok(ig.calls[0].url.includes('fields=id%2Cusername'));
});

test('an unreachable platform is UNREACHABLE, never a thrown network message', async () => {
  const down = async () => {
    throw new Error(`connect ECONNREFUSED ${TOKEN}`);
  };
  await assert.rejects(
    () => metaPages(down, TOKEN),
    (e) => e instanceof PlatformCallError && e.code === 'UNREACHABLE' && !e.message.includes(TOKEN),
  );
});

test('TikTok: the sign-in URL, the code exchange and the two tokens', async () => {
  const u = new URL(tiktokAuthUrl({ clientKey: 'ck', redirectUri: 'https://hub.test/cb', state: 's' }));
  assert.equal(u.origin + u.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(u.searchParams.get('client_key'), 'ck');
  assert.deepEqual(u.searchParams.get('scope').split(','), [...TIKTOK_SCOPES]);
  const f = fake((url, init) => {
    assert.equal(url, 'https://open.tiktokapis.com/v2/oauth/token/');
    assert.equal(init.method, 'POST');
    return json({ access_token: 'act.1', refresh_token: 'rft.1', open_id: 'OID', expires_in: 86400, refresh_expires_in: 31536000, scope: 'user.info.basic,video.publish' });
  });
  const t = await tiktokExchangeCode(f, { clientKey: 'ck', secret: SECRET, redirectUri: 'https://hub.test/cb', code: 'C' });
  assert.equal(t.openId, 'OID');
  assert.deepEqual(t.scope, ['user.info.basic', 'video.publish']);
  assert.ok(Date.parse(t.refreshExpiresAt) > Date.now() + 300 * 864e5);
  const body = new URLSearchParams(f.calls[0].init.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('client_secret'), SECRET);
  const packed = packTikTok(t);
  assert.equal(unpackTikTok(packed).refresh, 'rft.1');
  assert.equal(unpackTikTok('not json'), null);
});

test('TikTok health renews an ended access token with the refresh token and stores the new pair', async () => {
  const stored = packTikTok({ access: 'old', refresh: 'rft.old', openId: 'OID', scope: [], accessExpiresAt: new Date(Date.now() - 1000).toISOString(), refreshExpiresAt: new Date(Date.now() + 90 * 864e5).toISOString() });
  const f = fake((url) => {
    if (url.endsWith('/oauth/token/')) return json({ access_token: 'new', refresh_token: 'rft.new', expires_in: 86400, refresh_expires_in: 31536000, open_id: 'OID' });
    return json({ data: { user: { open_id: 'OID', display_name: 'الحساب' } }, error: { code: 'ok' } });
  });
  const h = await tiktokAccountHealth(f, { clientKey: 'ck', secret: SECRET, packed: stored });
  assert.equal(h.ok, true);
  assert.equal(unpackTikTok(h.newSecret).access, 'new');
  assert.equal(unpackTikTok(h.newSecret).refresh, 'rft.new');
  assert.ok(f.calls[1].init.headers.Authorization.endsWith('new'));

  // An access token still valid is used as it is, and nothing is rewritten.
  const fresh = packTikTok({ access: 'cur', refresh: 'r', openId: 'OID', scope: [], accessExpiresAt: new Date(Date.now() + 3600e3).toISOString(), refreshExpiresAt: new Date(Date.now() + 90 * 864e5).toISOString() });
  const f2 = fake(() => json({ data: { user: { open_id: 'OID' } }, error: { code: 'ok' } }));
  const h2 = await tiktokAccountHealth(f2, { clientKey: 'ck', secret: SECRET, packed: fresh });
  assert.equal(h2.ok, true);
  assert.equal(h2.newSecret, null);
  assert.equal(f2.calls.length, 1);

  // A refused refresh token says the connection must be made again.
  const f3 = fake(() => json({ error: 'invalid_grant' }, 400));
  const h3 = await tiktokAccountHealth(f3, { clientKey: 'ck', secret: SECRET, packed: stored });
  assert.equal(h3.ok, false);
  assert.equal(h3.error, 'TOKEN_EXPIRED');
  assert.equal((await tiktokRefresh(f3, { clientKey: 'ck', secret: SECRET, refresh: 'x' })).error, 'TOKEN_REFUSED');
  assert.equal((await tiktokUserInfo(fake(() => json({ error: { code: 'access_token_invalid' } }, 401)), 'x')).error, 'TOKEN_REFUSED');
  const none = await tiktokAccountHealth(f3, { clientKey: 'ck', secret: SECRET, packed: 'garbage' });
  assert.equal(none.error, 'NOT_CONNECTED');
});

test('which registry platform connects through which sign-in', () => {
  assert.equal(providerOf('facebook'), 'meta');
  assert.equal(providerOf('instagram'), 'meta');
  assert.equal(providerOf('tiktok'), 'tiktok');
  assert.equal(providerOf('snapchat'), null);
  assert.equal(clientProviderOf('instagram'), 'meta');
  // YouTube, LinkedIn and X joined on the same model (Action_Plan.md B9, tests/connections2.test.mjs).
  assert.equal(clientProviderOf('x'), 'x');
  assert.equal(clientProviderOf('whatsapp'), null);
  assert.deepEqual(Object.keys(ACCOUNT_TYPE).sort(), ['facebook', 'instagram', 'linkedin', 'tiktok', 'x', 'youtube']);
});

// ---------------------------------------------------------------------------
// Static rules on the files that touch tokens
// ---------------------------------------------------------------------------
const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const serverFiles = [...walk(join(root, 'src/app/api/platforms')), join(root, 'src/lib/platforms/oauth.ts'), join(root, 'src/lib/platforms/connect.ts'), join(root, 'src/lib/platforms/route.ts')];

test('no file that handles a token logs, and none returns a secret field', () => {
  for (const f of serverFiles) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/console\.(log|info|warn|error|debug)/.test(src), `${f} logs`);
  }
  // The routes answer with names and ids: no property named token or secret in a JSON answer.
  for (const f of walk(join(root, 'src/app/api/platforms'))) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/json\(\{[^}]*\b(token|secret|access_token|refresh_token)\b/.test(src), `${f} returns a secret`);
  }
});

test('no client component imports the files that hold tokens', () => {
  const clients = walk(join(root, 'src/components')).filter((f) => f.endsWith('.tsx'));
  for (const f of clients) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/platforms\/(oauth|connect|route)['"]/.test(src), `${f} imports a server file`);
  }
});

test('the platform routes are guarded: signed in, from this site when they change something', () => {
  for (const [file, mutating] of [['app/route.ts', true], ['link/route.ts', true], ['disconnect/route.ts', true], ['check/route.ts', true], ['offer/route.ts', false]]) {
    const src = readFileSync(join(root, 'src/app/api/platforms', file), 'utf8');
    assert.match(src, mutating ? /mutating: true|connectGuard\(request, true\)/ : /connectGuard\(request, false\)/, file);
  }
  const cb = readFileSync(join(root, 'src/app/api/platforms/callback/[provider]/route.ts'), 'utf8');
  assert.match(cb, /platform_oauth_state/);
  assert.match(cb, /state !== expected/);
});

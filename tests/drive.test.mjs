import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_UPLOAD_BYTES,
  CHUNK_BYTES,
  mediaKind,
  cleanName,
  sameOrigin,
  canUpload,
  formatBytes,
} from '../src/lib/drive/media.ts';
import { createDrive, driveConfigured, oauthConfigured, authUrl, exchangeCode, DriveError } from '../src/lib/drive/google.ts';
import { roleIds, roles } from '../src/lib/domain.ts';

const env = { clientId: 'cid', clientSecret: 'secret', refreshToken: 'refresh' };

/** A scripted fetch: each call is answered by the next handler, and recorded. */
function scripted(...handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = handlers.shift();
    assert.ok(next, `unexpected request to ${url}`);
    return next(String(url), init);
  };
  fn.calls = calls;
  return fn;
}
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const token = () => json({ access_token: 'at-1', expires_in: 3600 });

test('file kinds: media and documents are accepted, anything that can run script is refused', () => {
  assert.equal(mediaKind('image/png'), 'image');
  assert.equal(mediaKind('video/mp4'), 'video');
  assert.equal(mediaKind('audio/mpeg'), 'audio');
  assert.equal(mediaKind('application/pdf'), 'document');
  assert.equal(mediaKind('IMAGE/JPEG; charset=binary'), 'image');
  for (const bad of ['image/svg+xml', 'text/html', 'application/javascript', 'application/octet-stream', '']) {
    assert.equal(mediaKind(bad), null, bad);
  }
});

test('file names are cleaned of paths and control characters and kept to a bounded length', () => {
  assert.equal(cleanName('../../etc/passwd'), '.. .. etc passwd');
  assert.equal(cleanName('  a\u0000b\n.png '), 'ab.png');
  assert.equal(cleanName('   '), 'file');
  const long = cleanName('x'.repeat(400) + '.mp4');
  assert.equal(long.length, 200);
  assert.ok(long.endsWith('.mp4'));
});

test('a state-changing request must come from this site', () => {
  const url = 'https://hub.example/api/media/complete';
  assert.equal(sameOrigin('https://hub.example', url), true);
  assert.equal(sameOrigin('https://evil.example', url), false);
  assert.equal(sameOrigin(null, url), false);
  assert.equal(sameOrigin('not a url', url), false);
});

test('only roles that can create (and administrators) may add files', () => {
  for (const role of roleIds) assert.equal(canUpload({ role }), role === 'admin' || roles[role].create, role);
  assert.equal(canUpload({ role: 'publisher' }), false);
});

test('the database rule for who may add files matches the product roles', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261011120000_media_files.sql', import.meta.url), 'utf8');
  const inList = sql.match(/a\.role in \(([^)]*)\)/)?.[1] ?? '';
  const inSql = inList.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  const inCode = roleIds.filter((r) => r === 'admin' || roles[r].create).sort();
  assert.deepEqual(inSql, inCode);
});

test('limits: chunks are whole multiples of 256 KiB, the cap is 5 GiB', () => {
  assert.equal(CHUNK_BYTES % (256 * 1024), 0);
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 ** 3);
  assert.equal(formatBytes(1536), '1.5 KB');
});

test('configuration is read as two separate steps: the client, then the connection', () => {
  assert.equal(oauthConfigured({}), false);
  assert.equal(oauthConfigured({ clientId: 'a', clientSecret: 'b' }), true);
  assert.equal(driveConfigured({ clientId: 'a', clientSecret: 'b' }), false);
  assert.equal(driveConfigured(env), true);
});

test('an access token is fetched once and reused until close to expiry', async () => {
  let clock = 1_000_000;
  const fetch = scripted(
    token,
    () => json({ files: [{ id: 'folder-1' }] }),
    () => json({ id: 'f1', name: 'a.png', mimeType: 'image/png', size: '10' }),
    token,
    () => json({ id: 'f1', name: 'a.png', mimeType: 'image/png', size: '10' }),
  );
  const drive = createDrive({ env, fetch, now: () => clock });
  await drive.fileInfo('f1');
  await drive.fileInfo('f1');
  assert.equal(fetch.calls.filter((c) => c.url.includes('oauth2.googleapis.com')).length, 1, 'one token for two calls');
  const body = new URLSearchParams(fetch.calls[0].init.body);
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh');
  clock += 3600 * 1000; // expired
  await drive.fileInfo('f1');
  assert.equal(fetch.calls.filter((c) => c.url.includes('oauth2.googleapis.com')).length, 2, 'a new token after expiry');
});

test('the Hub folder is found by its marker or created once, and then remembered', async () => {
  const fetch = scripted(
    token,
    () => json({ files: [] }),
    (url, init) => {
      assert.match(url, /\/drive\/v3\/files\?fields=id$/);
      const sent = JSON.parse(init.body);
      assert.equal(sent.mimeType, 'application/vnd.google-apps.folder');
      assert.deepEqual(sent.appProperties, { commsHubRoot: '1' });
      return json({ id: 'new-folder' });
    },
  );
  const drive = createDrive({ env, fetch });
  assert.equal(await drive.rootFolder(), 'new-folder');
  assert.equal(await drive.rootFolder(), 'new-folder', 'second call makes no request');
  assert.equal(fetch.calls.length, 3);
});

test('a pinned folder id is used without any lookup', async () => {
  const fetch = scripted();
  const drive = createDrive({ env: { ...env, folderId: 'pinned' }, fetch });
  assert.equal(await drive.rootFolder(), 'pinned');
  assert.equal(fetch.calls.length, 0);
});

test('starting an upload asks Drive for a resumable session that the browser may use directly', async () => {
  const fetch = scripted(
    token,
    () => json({ files: [{ id: 'folder-1' }] }),
    (url, init) => {
      assert.match(url, /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=resumable/);
      assert.equal(init.method, 'POST');
      assert.equal(init.headers.Authorization, 'Bearer at-1');
      assert.equal(init.headers['X-Upload-Content-Type'], 'video/mp4');
      assert.equal(init.headers['X-Upload-Content-Length'], '123456');
      assert.equal(init.headers.Origin, 'https://hub.example');
      const sent = JSON.parse(init.body);
      assert.deepEqual(sent.parents, ['folder-1']);
      assert.equal(sent.name, 'reel.mp4');
      assert.deepEqual(sent.appProperties, { commsHub: '1', uploadedBy: 'a@example.com' });
      return new Response(null, { status: 200, headers: { Location: 'https://upload.example/session/xyz' } });
    },
  );
  const drive = createDrive({ env, fetch });
  const url = await drive.startUpload({
    name: 'reel.mp4',
    mimeType: 'video/mp4',
    size: 123456,
    origin: 'https://hub.example',
    uploadedBy: 'a@example.com',
  });
  assert.equal(url, 'https://upload.example/session/xyz');
});

test('without a connection every call fails closed, and a refused token is a gateway error', async () => {
  await assert.rejects(createDrive({ env: {}, fetch: scripted() }).fileInfo('x'), (e) => e instanceof DriveError && e.status === 503);
  const refused = scripted(() => new Response('{}', { status: 400 }));
  await assert.rejects(createDrive({ env, fetch: refused }).fileInfo('x'), (e) => e instanceof DriveError && e.status === 502);
});

test('opening a file passes the Range header through, for video seeking', async () => {
  const fetch = scripted(token, (url, init) => {
    assert.match(url, /\/files\/abc\?alt=media$/);
    assert.equal(init.headers.Range, 'bytes=0-99');
    return new Response('x', { status: 206 });
  });
  const res = await createDrive({ env, fetch }).open('abc', 'bytes=0-99');
  assert.equal(res.status, 206);
});

test('the connect link asks for the narrow scope, offline access and a state value', () => {
  const url = new URL(authUrl(env, 'https://hub.example', 'state-1', 'hub@gmail.com'));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/drive.file');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://hub.example/api/drive/callback');
  assert.equal(url.searchParams.get('state'), 'state-1');
  assert.equal(url.searchParams.get('login_hint'), 'hub@gmail.com');
});

test('exchanging the code returns the refresh token, or null when Google withholds it', async () => {
  const ok = scripted((url, init) => {
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code'), 'the-code');
    assert.equal(body.get('redirect_uri'), 'https://hub.example/api/drive/callback');
    return json({ access_token: 'a', refresh_token: 'r' });
  });
  assert.deepEqual(await exchangeCode(env, 'https://hub.example', 'the-code', ok), { refreshToken: 'r', accessToken: 'a' });
  const none = scripted(() => json({ access_token: 'a' }));
  assert.equal((await exchangeCode(env, 'https://hub.example', 'c', none)).refreshToken, null);
});

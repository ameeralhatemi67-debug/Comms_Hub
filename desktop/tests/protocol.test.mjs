// commshub-file:// (src/protocol.ts, D4; DT-10): real files read in ranges, every refusal, and CORS for
// the page on the list only.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { answer } from '../src/protocol.ts';
import { FileStore } from '../src/file-store.ts';
import { CacheStore } from '../src/cache-store.ts';
import { originsFor } from '../src/origins.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-protocol-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const bytes = crypto.randomBytes(300_000);
const clip = path.join(dir, 'clip.mp4');
fs.writeFileSync(clip, bytes);
const files = new FileStore(path.join(dir, 'files.json'));
const cache = new CacheStore(path.join(dir, 'cache.json'), path.join(dir, 'cache'));
fs.mkdirSync(path.join(dir, 'cache'));
const proxyName = 'proxy-abc-720.mp4';
fs.writeFileSync(path.join(dir, 'cache', proxyName), bytes.subarray(0, 1000));
cache.record(proxyName, 'clip.mp4');
const o = { files, cache, allowed: originsFor(false) };
const SITE = 'https://comms-hub-three.vercel.app';
const token = files.add(clip).token;
const get = (url, headers = {}, method = 'GET') => answer(new Request(url, { method, headers }), o);
const local = `commshub-file://local/${token}`;

test('a range is served as 206 with its headers, and the bytes are the file\'s', async () => {
  const r = get(local, { range: 'bytes=100000-100099', origin: SITE });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-range'), `bytes 100000-100099/${bytes.length}`);
  assert.equal(r.headers.get('content-length'), '100');
  assert.equal(r.headers.get('accept-ranges'), 'bytes');
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  assert.match(r.headers.get('access-control-expose-headers'), /Content-Range/);
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(bytes.subarray(100000, 100100)));
});

test('no range: the whole file; the last bytes; past the end: 416', async () => {
  const whole = get(local);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('access-control-allow-origin'), null, 'no Origin, no CORS header (a media element)');
  assert.ok(Buffer.from(await whole.arrayBuffer()).equals(bytes));
  const tail = get(local, { range: 'bytes=-10' });
  assert.ok(Buffer.from(await tail.arrayBuffer()).equals(bytes.subarray(bytes.length - 10)));
  const past = get(local, { range: `bytes=${bytes.length}-` });
  assert.equal(past.status, 416);
  assert.equal(past.headers.get('content-range'), `bytes */${bytes.length}`);
  const head = get(local, { range: 'bytes=0-9' }, 'HEAD');
  assert.equal(head.status, 206);
  assert.equal(head.body, null);
});

test('DT-10: a foreign origin, a path, an unknown or forgotten token, a changed file, any other method: refused', () => {
  assert.equal(get(local, { origin: 'https://example.com' }).status, 403);
  assert.equal(get(local, { origin: 'http://127.0.0.1:3000' }).status, 403, 'the local site in a release build');
  assert.equal(get(local, { origin: 'null' }).status, 403);
  for (const url of ['commshub-file://local/..%2Fclip.mp4', `commshub-file://local/${encodeURIComponent(clip)}`, 'commshub-file://local/C:%5CWindows%5Cwin.ini', `commshub-file://local/${'A'.repeat(43)}`, 'commshub-file://cache/cache.json', 'commshub-file://cache/asset-x-v1.bin']) {
    assert.equal(get(url).status, 404, url);
  }
  assert.equal(get(local, {}, 'POST').status, 405);
  assert.equal(get(local, {}, 'DELETE').status, 405);
  const other = path.join(dir, 'other.mov');
  fs.writeFileSync(other, 'x');
  const t2 = files.add(other).token;
  fs.appendFileSync(other, 'changed');
  assert.equal(get(`commshub-file://local/${t2}`).status, 410, 'the file changed since it was chosen');
  files.forget(t2);
  assert.equal(get(`commshub-file://local/${t2}`).status, 404, 'forgotten');
});

test('the CORS question gets its answer for the page on the list only', () => {
  const ok = get(local, { origin: SITE, 'access-control-request-method': 'GET', 'access-control-request-headers': 'range' }, 'OPTIONS');
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-headers'), 'Range');
  assert.equal(get(local, { origin: 'https://example.com' }, 'OPTIONS').status, 403);
});

test('a copy in the cache folder is read the same way', async () => {
  const r = get(`commshub-file://cache/${proxyName}`, { range: 'bytes=0-9' });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-type'), 'video/mp4');
  assert.ok(Buffer.from(await r.arrayBuffer()).equals(bytes.subarray(0, 10)));
});

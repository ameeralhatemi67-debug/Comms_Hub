// The studio's cache folder (src/cache-store.ts, D4): a copy in resumable parts from a local server, the
// ten-day rule, the size limit, clearing and another folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CacheStore, dueForSweep, FOLDER_NAME, libraryName, overLimit, PART, TEN_DAYS } from '../src/cache-store.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-cache-'));
const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';
const body = crypto.randomBytes(PART * 2 + 12345);
let requests = [];
let failAfter = Infinity;
const server = http.createServer((req, res) => {
  requests.push(req.headers.range);
  if (requests.length > failAfter) {
    res.writeHead(500);
    return res.end();
  }
  const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
  const from = Number(m[1]);
  const to = Math.min(body.length - 1, Number(m[2]));
  res.writeHead(206, { 'content-range': `bytes ${from}-${to}/${body.length}` });
  res.end(body.subarray(from, to + 1));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/api/media/${asset}/content?v=3`;
const fetcher = (u, init) => fetch(u, init);
test.after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a library version\'s name, and nothing that is not one', () => {
  assert.equal(libraryName(asset, 3), `asset-${asset}-v3.bin`);
  for (const [a, v] of [['../x', 1], [asset, 0], [asset, 1.5], [asset, '3'], ['ABC', 1]]) assert.equal(libraryName(a, v), null);
});

test('a copy in 16 MB parts, resumed after a failure, byte for byte', async () => {
  const store = new CacheStore(path.join(dir, 'cache.json'), path.join(dir, 'default'));
  const name = libraryName(asset, 3);
  failAfter = 1;
  requests = [];
  await assert.rejects(store.library(name, url, fetcher, { label: 'a.mp4' }));
  failAfter = Infinity;
  const progress = [];
  const e = await store.library(name, url, fetcher, { label: 'a.mp4', onProgress: (d) => progress.push(d) });
  assert.equal(e.complete, true);
  assert.equal(e.total, body.length);
  assert.deepEqual(requests, [`bytes=0-${PART - 1}`, `bytes=${PART}-${2 * PART - 1}`, `bytes=${PART}-${2 * PART - 1}`, `bytes=${2 * PART}-${body.length - 1}`], 'the second part was asked again, never the first; the last part ends where the file does');
  assert.ok(fs.readFileSync(path.join(dir, 'default', name)).equals(body));
  assert.equal(store.complete(name).size, body.length);
  requests = [];
  await store.library(name, url, fetcher);
  assert.deepEqual(requests, [], 'complete: nothing fetched again');
  assert.deepEqual(new CacheStore(path.join(dir, 'cache.json'), path.join(dir, 'default')).complete(name)?.size, body.length, 'kept across a restart');
});

test('a copy the site refuses, or one that fails before its first byte, leaves no entry and no file', async () => {
  const store = new CacheStore(path.join(dir, 'refused.json'), path.join(dir, 'refused'));
  const name = libraryName(asset, 9);
  const refusing = async () => ({ status: 401, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) });
  await assert.rejects(store.library(name, url, refusing), /DENIED/);
  assert.equal(store.entries().length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'refused', name)), false);
  const failing = async () => {
    throw new Error('network');
  };
  await assert.rejects(store.library(name, url, failing), /network/);
  assert.equal(store.entries().length, 0);
  assert.equal(fs.existsSync(path.join(dir, 'refused', name)), false);
});

test('the ten-day rule and the size limit spare what is in use', () => {
  const now = 100 * 86_400_000;
  const e = (name, bytes, ago) => ({ name, kind: 'library', bytes, total: bytes, complete: true, lastUsed: now - ago, label: '' });
  const entries = { a: e('a', 10, TEN_DAYS), b: e('b', 10, TEN_DAYS - 1), c: e('c', 10, TEN_DAYS * 3) };
  assert.deepEqual(dueForSweep(entries, now, new Set(['c'])), ['a']);
  assert.deepEqual(overLimit(entries, 15, new Set()), ['c', 'a'], 'oldest first, until it fits');
  assert.deepEqual(overLimit(entries, 15, new Set(['c'])), ['a', 'b']);
  assert.deepEqual(overLimit(entries, 0, new Set()), [], 'no limit');
});

test('another folder: its own subfolder, the old copies removed, only offered limits', async () => {
  const store = new CacheStore(path.join(dir, 'c2.json'), path.join(dir, 'default2'));
  const name = libraryName(asset, 3);
  await store.library(name, url, fetcher);
  const chosen = path.join(dir, 'chosen');
  fs.mkdirSync(chosen);
  fs.writeFileSync(path.join(chosen, 'mine.txt'), 'the person\'s own file');
  store.setFolder(chosen);
  assert.equal(store.folder(), path.join(chosen, FOLDER_NAME));
  assert.equal(fs.existsSync(path.join(dir, 'default2', name)), false, 'the old copy is gone');
  assert.equal(fs.readFileSync(path.join(chosen, 'mine.txt'), 'utf8'), 'the person\'s own file', 'nothing else in the chosen folder is touched');
  assert.equal(store.entries().length, 0);
  assert.throws(() => store.setLimit(12345));
  store.setLimit(10e9);
  assert.equal(store.usage().limit, 10e9);
  assert.throws(() => store.setFolder('relative'));
  store.setFolder(null);
  assert.equal(store.isDefault(), true);
});

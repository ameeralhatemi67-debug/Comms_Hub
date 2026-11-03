// The studio's cache folder (src/cache-store.ts, D4): a copy in resumable parts from a local server, from D12 (P-29)
// several parts at once, the ten-day rule, the size limit, clearing and another folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { CacheStore, dueForSweep, FOLDER_NAME, libraryName, MAX_RANGES, overLimit, PART, RANGES, TEN_DAYS } from '../src/cache-store.ts';

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
  const second = `bytes=${PART}-${2 * PART - 1}`;
  const last = `bytes=${2 * PART}-${body.length - 1}`;
  assert.equal(requests[0], `bytes=0-${PART - 1}`, 'the first part alone, which says the size');
  assert.ok(requests.slice(1).every((r) => r === second || r === last), 'then the next two at once, which failed, and never the first part again');
  assert.deepEqual(requests.slice(-2).sort(), [second, last].sort(), 'resumed from the first gap, two at once; the last part ends where the file does');
  assert.ok(fs.readFileSync(path.join(dir, 'default', name)).equals(body));
  assert.equal(store.complete(name).size, body.length);
  requests = [];
  await store.library(name, url, fetcher);
  assert.deepEqual(requests, [], 'complete: nothing fetched again');
  assert.deepEqual(new CacheStore(path.join(dir, 'cache.json'), path.join(dir, 'default')).complete(name)?.size, body.length, 'kept across a restart');
});

/**
 * A server whose every answer waits `ms` and then comes at `perSecond` bytes a second on each connection, as a far
 * provider's does, and that can fail one range once.
 */
async function slowServer(file, ms, perSecond = 0) {
  let failOnce = null;
  const seen = [];
  let at = 0;
  let most = 0;
  const s = http.createServer((req, res) => {
    seen.push(req.headers.range);
    at++;
    most = Math.max(most, at);
    setTimeout(() => {
      at--;
      const m = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
      if (failOnce && req.headers.range === failOnce) {
        failOnce = null;
        res.writeHead(503);
        return res.end();
      }
      const from = Number(m[1]);
      const to = Math.min(file.length - 1, Number(m[2]));
      res.writeHead(206, { 'content-range': `bytes ${from}-${to}/${file.length}` });
      if (!perSecond) return res.end(file.subarray(from, to + 1));
      const step = 1 << 20;
      let pos = from;
      const send = () => {
        if (pos > to) return res.end();
        const end = Math.min(to + 1, pos + step);
        res.write(file.subarray(pos, end));
        pos = end;
        setTimeout(send, (1000 * step) / perSecond);
      };
      send();
    }, ms);
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${s.address().port}/x`, seen, most: () => most, failOnce: (r) => (failOnce = r), close: () => s.close() };
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

test('several parts at once (two unless said, at most four): over a slow link the copy is faster, and the same bytes', async () => {
  assert.equal(RANGES, 2);
  assert.equal(MAX_RANGES, 4);
  const file = crypto.randomBytes(PART * 5 + 777);
  const slow = await slowServer(file, 100, 50 * 1024 * 1024);
  const times = {};
  try {
    for (const ranges of [1, 3]) {
      const store = new CacheStore(path.join(dir, `slow-${ranges}.json`), path.join(dir, `slow-${ranges}`));
      const name = libraryName(asset, 20 + ranges);
      const t0 = Date.now();
      await store.library(name, slow.url, fetcher, { ranges });
      times[ranges] = Date.now() - t0;
      assert.equal(sha(fs.readFileSync(path.join(dir, `slow-${ranges}`, name))), sha(file), `${ranges}: byte for byte`);
    }
    assert.ok(slow.most() <= 3, `never more than asked at once: ${slow.most()}`);
    assert.ok(times[3] * 1.5 < times[1], `three at once is faster: ${JSON.stringify(times)}`);
    console.log(`# a ${(file.length / 1048576).toFixed(0)} MB copy, answers after 100 ms at 50 MB/s each: ${times[1]} ms one part at a time, ${times[3]} ms three at once`);
  } finally {
    slow.close();
  }
});

test('a cut while later parts were already written keeps only the unbroken start, and the copy resumes from the first gap', async () => {
  const file = crypto.randomBytes(PART * 4 + 99);
  const slow = await slowServer(file, 20);
  try {
    const store = new CacheStore(path.join(dir, 'gap.json'), path.join(dir, 'gap'));
    const name = libraryName(asset, 30);
    slow.failOnce(`bytes=${PART}-${2 * PART - 1}`);
    await assert.rejects(store.library(name, slow.url, fetcher, { ranges: 3 }), /HTTP_503/);
    const kept = store.entries().find((x) => x.name === name);
    assert.equal(kept.bytes, PART, 'the start before the gap, not the parts after it');
    assert.equal(kept.complete, false);
    slow.seen.length = 0;
    const e = await new CacheStore(path.join(dir, 'gap.json'), path.join(dir, 'gap')).library(name, slow.url, fetcher, { ranges: 3 });
    assert.equal(e.complete, true);
    assert.equal(slow.seen.includes(`bytes=0-${PART - 1}`), false, 'the kept start is not fetched again');
    assert.equal(sha(fs.readFileSync(path.join(dir, 'gap', name))), sha(file), 'byte for byte');
  } finally {
    slow.close();
  }
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

test('a light copy (D5): written as a .part never served, held while it is made, recorded, then under the limit', async () => {
  const store = new CacheStore(path.join(dir, 'c3.json'), path.join(dir, 'default3'));
  fs.mkdirSync(store.folder(), { recursive: true });
  const name = `proxy-${asset}-v3-720-r1-ff902.mp4`;
  assert.equal(store.partOf(name), path.join(store.folder(), `${name}.part`));
  assert.throws(() => store.partOf('../x.mp4'));
  let finish;
  const work = new Promise((r) => (finish = r));
  const held = store.hold(name, work);
  fs.writeFileSync(store.partOf(name), Buffer.alloc(1000));
  assert.equal(store.isRunning(name), true);
  assert.equal(store.cleanParts(), 0, 'a copy being made is left alone');
  fs.renameSync(store.partOf(name), store.pathOf(name));
  store.record(name, '720p · a.mov');
  assert.equal(store.clear().removed, 0, 'nor is it cleared while it is held');
  finish();
  await held;
  assert.equal(store.isRunning(name), false);
  assert.deepEqual(store.complete(name), { file: store.pathOf(name), size: 1000 });
  assert.equal(store.entries()[0].kind, 'proxy');
  assert.equal(store.usage().proxy, 1000);
  // an interrupted copy leaves a .part behind; it goes at the next start, and nothing else does
  fs.writeFileSync(store.partOf(`convert-${asset}-v3-r1-ff902.mp4`), 'x');
  fs.writeFileSync(path.join(store.folder(), 'other.part'), 'x');
  assert.equal(store.cleanParts(), 1);
  assert.equal(fs.existsSync(path.join(store.folder(), 'other.part')), true);
  // a recorded copy is kept under the limit: the oldest copy not in use goes first
  const older = `proxy-${asset}-v4-720-r1-ff902.mp4`;
  fs.writeFileSync(store.pathOf(older), Buffer.alloc(10));
  store.record(older);
  store.setLimit(10e9);
  assert.equal(store.entries().length, 2);
});

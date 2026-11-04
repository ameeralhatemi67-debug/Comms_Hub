// The record of chosen files (src/file-store.ts, D4; DT-10): real files in a scratch folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { FileStore, fingerprintOf } from '../src/file-store.ts';
import { TOKEN } from '../src/files.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-files-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const put = (name, bytes) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, bytes);
  return f;
};

test('a chosen video gets a token; the same unchanged file keeps it; the record survives a restart', () => {
  const clip = put('مشهد.mp4', crypto.randomBytes(9 * 1024 * 1024));
  const record = path.join(dir, 'files.json');
  const store = new FileStore(record);
  const a = store.add(clip);
  assert.match(a.token, TOKEN);
  assert.equal(a.name, 'مشهد.mp4');
  assert.equal(a.media, 'video');
  assert.equal(a.size, 9 * 1024 * 1024);
  assert.equal(store.add(clip).token, a.token, 'chosen again: the same token');
  const again = new FileStore(record);
  assert.equal(again.lookup(a.token).record.path, clip, 'kept in the profile');
});

test('only regular files of a kind the studio takes, by absolute path', () => {
  const store = new FileStore(path.join(dir, 'kinds.json'));
  assert.equal(store.add(put('notes.txt', 'x')), null);
  assert.equal(store.add(dir), null, 'a folder');
  assert.equal(store.add(path.join(dir, 'missing.mp4')), null);
  assert.equal(store.add('relative.mp4'), null);
  assert.equal(store.add(42), null);
});

test('a file changed, moved or removed is no longer served; forget and clear end a token', () => {
  const store = new FileStore(path.join(dir, 'life.json'));
  const f = put('a.wav', Buffer.alloc(1000, 1));
  const r = store.add(f);
  assert.ok('record' in store.lookup(r.token));
  fs.appendFileSync(f, 'more');
  assert.deepEqual(store.lookup(r.token), { missing: 'changed' });
  const g = put('b.png', Buffer.alloc(10, 2));
  const s = store.add(g);
  fs.renameSync(g, `${g}.moved`);
  assert.deepEqual(store.lookup(s.token), { missing: 'gone' });
  assert.deepEqual(store.lookup('A'.repeat(43)), { missing: 'unknown' });
  const h = store.add(put('c.mp3', Buffer.alloc(10, 3)));
  assert.equal(store.forget(h.token), true);
  assert.deepEqual(store.lookup(h.token), { missing: 'unknown' });
  assert.equal(store.clear(), 2);
  assert.equal(store.size, 0);
});

test('the fingerprint reads the size and the first and last 4 MB, as the site keys a device file', () => {
  const small = put('s.mp4', Buffer.from('abc'));
  assert.equal(fingerprintOf(small, 3), crypto.createHash('sha256').update('3|').update('abc').digest('hex'));
  const big = Buffer.alloc(12 * 1024 * 1024, 5);
  big[0] = 1;
  big[big.length - 1] = 9;
  const f = put('big.mp4', big);
  const expected = crypto.createHash('sha256').update(`${big.length}|`).update(big.subarray(0, 4 * 1024 * 1024)).update(big.subarray(big.length - 4 * 1024 * 1024)).digest('hex');
  assert.equal(fingerprintOf(f, big.length), expected);
});

test('a file is dragged out only for a token this store gave, still as chosen; unknown, changed and forgotten tokens drag nothing (D12, P-22)', () => {
  const store = new FileStore(path.join(dir, 'drag.json'));
  const f = put('export.mp4', Buffer.alloc(2048, 7));
  const r = store.add(f);
  assert.equal(store.dragPath(r.token), f);
  for (const bad of ['A'.repeat(43), 'short', '../export.mp4', f, null, 42, { token: r.token }]) assert.equal(store.dragPath(bad), null, String(bad));
  fs.appendFileSync(f, 'x');
  assert.equal(store.dragPath(r.token), null, 'changed since it was chosen');
  const again = store.add(f);
  assert.equal(store.dragPath(again.token), f);
  store.forget(again.token);
  assert.equal(store.dragPath(again.token), null, 'forgotten');
});

// Files used in place and their addresses (src/files.ts, src/range.ts; D4, DT-10 of Desktop_App_Plan.md 12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addressOf, CACHE_NAME, dialogFilters, kindOf, newToken, parseAddress, publicView, TOKEN, unchanged } from '../src/files.ts';
import { parseRange, rangeHeaders } from '../src/range.ts';

const token = newToken(new Uint8Array(32).fill(7));

test('a token is 32 random bytes in base64url, and nothing shorter or longer', () => {
  assert.match(token, TOKEN);
  assert.equal(token.length, 43);
  assert.throws(() => newToken(new Uint8Array(16)));
  assert.notEqual(newToken(new Uint8Array(32).fill(8)), token);
});

test('an address names exactly one token or one cache name, never a path', () => {
  assert.deepEqual(parseAddress(addressOf('local', token)), { kind: 'local', token });
  assert.deepEqual(parseAddress('commshub-file://cache/asset-0000-v3.bin'), { kind: 'cache', name: 'asset-0000-v3.bin' });
  const refused = [
    `commshub-file://local/${token}/extra`,
    'commshub-file://local/..%2F..%2Fwindows%2Fwin.ini',
    'commshub-file://local/C:%5CWindows%5Cwin.ini',
    'commshub-file://local/abc',
    `commshub-file://other/${token}`,
    `commshub-file://user:pass@local/${token}`,
    `commshub-file://local:99/${token}`,
    'commshub-file://cache/../manifest.json',
    'commshub-file://cache/manifest.json',
    'commshub-file://cache/Asset.BIN',
    'commshub-file://cache/a%2Fb.bin',
    `file:///C:/Windows/win.ini`,
    `https://comms-hub-three.vercel.app/${token}`,
    'not an address',
  ];
  for (const url of refused) assert.equal(parseAddress(url), null, url);
  assert.ok(CACHE_NAME.test('proxy-abc123-720-ffmpeg9.0.2.mp4') === false, 'dots belong only before the extension');
  // The address parser resolves dot segments first, so ../ cannot climb anywhere: it only names a token.
  assert.deepEqual(parseAddress(`commshub-file://local/../${token}`), { kind: 'local', token });
});

test('the kinds the studio takes, and the dialog\'s Arabic filters', () => {
  assert.deepEqual(kindOf('مشهد.MOV'), { media: 'video', type: 'video/quicktime' });
  assert.deepEqual(kindOf('a.mts'), { media: 'video', type: 'video/mp2t' });
  assert.equal(kindOf('notes.txt'), null);
  assert.equal(kindOf('noextension'), null);
  const f = dialogFilters(['video', 'audio', 'evil']);
  assert.deepEqual(f.map((x) => x.name), ['فيديو', 'صوت']);
  assert.ok(f[0].extensions.includes('mp4') && !f[0].extensions.includes('mp3'));
  assert.equal(dialogFilters([]).length, 3, 'nothing asked: every kind');
});

test('the page is told name, size, type and date, never where the file is', () => {
  const r = { token, path: 'D:\\camera\\clip.mp4', name: 'clip.mp4', size: 10, mtimeMs: 1000.4, type: 'video/mp4', media: 'video', fingerprint: 'f' };
  const v = publicView(r);
  assert.deepEqual(Object.keys(v), ['token', 'name', 'size', 'type', 'media', 'modified']);
  assert.equal(JSON.stringify(v).includes('camera'), false);
  assert.equal(unchanged(r, { size: 10, mtimeMs: 1000.4, isFile: true }), true);
  assert.equal(unchanged(r, { size: 11, mtimeMs: 1000.4, isFile: true }), false, 'changed');
  assert.equal(unchanged(r, { size: 10, mtimeMs: 2000, isFile: true }), false, 'saved again');
  assert.equal(unchanged(r, { size: 10, mtimeMs: 1000.4, isFile: false }), false, 'now a folder');
});

test('DT-10: byte ranges, one at a time', () => {
  const size = 5_000_000_000;
  assert.equal(parseRange(null, size), 'full');
  assert.deepEqual(parseRange('bytes=0-99', size), { start: 0, end: 99 });
  assert.deepEqual(parseRange('bytes=4999999990-', size), { start: 4999999990, end: 4999999999 }, 'past 4 GB');
  assert.deepEqual(parseRange('bytes=4999999990-9999999999', size), { start: 4999999990, end: 4999999999 }, 'cut at the end');
  assert.deepEqual(parseRange('bytes=-100', size), { start: 4999999900, end: 4999999999 }, 'the last 100 bytes');
  assert.deepEqual(parseRange('bytes=-100', 50), { start: 0, end: 49 });
  assert.equal(parseRange('bytes=5000000000-', size), 'unsatisfiable');
  assert.equal(parseRange('bytes=-0', size), 'unsatisfiable');
  assert.equal(parseRange('bytes=0-', 0), 'unsatisfiable');
  for (const ignored of ['bytes=0-1,5-9', 'bytes=9-2', 'items=0-9', 'bytes=-', 'bytes=a-b', 'bytes=99999999999999999999-']) assert.equal(parseRange(ignored, size), 'full', ignored);
  assert.deepEqual(rangeHeaders({ start: 4999999990, end: 4999999999 }, size), { 'Content-Range': 'bytes 4999999990-4999999999/5000000000', 'Content-Length': '10' });
});

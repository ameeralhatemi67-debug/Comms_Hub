// What the page may ask through the bridge, checked before anything is done (src/bridge.ts, D2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { badgeOf, holdIdOf, NOTICE_LIMITS, noticeOf, pathOn, reasonOf, REASONS } from '../src/bridge.ts';
import { originsFor } from '../src/origins.ts';

const release = originsFor(false);
const dev = originsFor(true);
const page = 'https://comms-hub-three.vercel.app/motion/studio/p1';

test('a reason is one of a fixed list', () => {
  assert.deepEqual([...REASONS], ['export', 'upload']);
  assert.equal(reasonOf('export'), 'export');
  assert.equal(reasonOf('upload'), 'upload');
  for (const bad of ['Export', 'render', '', null, undefined, 1, {}, ['export']]) assert.equal(reasonOf(bad), null, String(bad));
});

test('a hold number and a badge count are small whole numbers', () => {
  assert.equal(holdIdOf(3), 3);
  for (const bad of [0, -1, 1.5, '3', null, Number.MAX_SAFE_INTEGER + 1, NaN]) assert.equal(holdIdOf(bad), null, String(bad));
  assert.equal(badgeOf(0), 0);
  assert.equal(badgeOf(12), 12);
  assert.equal(badgeOf(9999), 9999);
  for (const bad of [-1, 10000, 2.5, '2', null, Infinity]) assert.equal(badgeOf(bad), null, String(bad));
});

test('a notice is short plain text; its link is a path on the asking page\'s own address', () => {
  assert.deepEqual(noticeOf({ title: 'يحتاج قرارك', body: 'اعتماد العمل CH-101', go: '/work/CH-101?tab=review#v2' }, page, release), {
    title: 'يحتاج قرارك',
    body: 'اعتماد العمل CH-101',
    go: '/work/CH-101?tab=review#v2',
  });
  assert.deepEqual(noticeOf({ title: 'انتهى التصدير' }, page, release), { title: 'انتهى التصدير', body: '', go: null });
  assert.deepEqual(noticeOf({ title: 'a\nb\u0000c', body: ' x y ' }, page, release), { title: 'a b c', body: 'x y', go: null }, 'control characters become spaces');
});

test('a notice is refused whole when anything in it is wrong', () => {
  const bad = [
    null,
    'text',
    ['title'],
    {},
    { title: '' },
    { title: '   ' },
    { title: 5 },
    { title: 'x', body: 7 },
    { title: 'x'.repeat(NOTICE_LIMITS.title + 1) },
    { title: 'x', body: 'y'.repeat(NOTICE_LIMITS.body + 1) },
    { title: 'x', go: 'https://example.com/' },
    { title: 'x', go: '//example.com/' },
    { title: 'x', go: '/\\example.com' },
    { title: 'x', go: 'work/CH-101' },
    { title: 'x', go: 'javascript:alert(1)' },
    { title: 'x', go: `/${'a'.repeat(NOTICE_LIMITS.go)}` },
    { title: 'x', go: 12 },
  ];
  for (const value of bad) assert.equal(noticeOf(value, page, release), null, JSON.stringify(value));
});

test('a link is resolved against the asking page, which must itself be on the list', () => {
  assert.equal(pathOn('/requests', page, release), '/requests');
  assert.equal(pathOn('/requests', 'https://example.com/', release), null, 'a page off the list');
  assert.equal(pathOn('/requests', 'http://127.0.0.1:3000/', release), null, 'the local site in a release build');
  assert.equal(pathOn('/requests', 'http://127.0.0.1:3000/', dev), '/requests', 'the local site in a development build');
  assert.equal(pathOn('/a/../b', page, release), '/b', 'dot segments are resolved, never leave the address');
});

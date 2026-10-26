// The count drawn for the taskbar, and the tray's dot (src/badge.ts, D2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGE_RED, badgeBitmap, badgeLabel, withDot } from '../src/badge.ts';

const px = (buf, size, x, y) => {
  const i = (y * size + x) * 4;
  return { b: buf[i], g: buf[i + 1], r: buf[i + 2], a: buf[i + 3] };
};
const white = (p) => p.r === 255 && p.g === 255 && p.b === 255 && p.a === 255;

test('the label: nothing for none, the figure up to 9, then 9+', () => {
  assert.deepEqual([0, -2, NaN, 1, 9, 10, 250].map(badgeLabel), ['', '', '', '1', '9', '9+', '9+']);
});

test('no picture for no notices', () => {
  assert.equal(badgeBitmap(0, 16), null);
});

for (const size of [16, 32]) {
  test(`a ${size}-pixel badge: a red disc, clear corners, white figures inside it`, () => {
    for (const n of [1, 4, 8, 12]) {
      const buf = badgeBitmap(n, size);
      assert.equal(buf.length, size * size * 4);
      assert.equal(px(buf, size, 0, 0).a, 0, 'a clear corner');
      assert.equal(px(buf, size, size - 1, size - 1).a, 0, 'a clear corner');
      let whites = 0;
      let reds = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const p = px(buf, size, x, y);
          if (white(p)) {
            whites++;
            assert.ok(Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= size / 2, 'figures stay on the disc');
          } else if (p.a === 255) {
            assert.deepEqual([p.r, p.g, p.b], [BADGE_RED.r, BADGE_RED.g, BADGE_RED.b]);
            reds++;
          }
        }
      }
      assert.ok(whites > 0 && reds > whites, `${n}: ${whites} white, ${reds} red`);
    }
    // "1" and "8" differ; 12 and 99 both say 9+.
    assert.notDeepEqual(badgeBitmap(1, size), badgeBitmap(8, size));
    assert.deepEqual(badgeBitmap(12, size), badgeBitmap(99, size));
  });
}

test('the tray dot leaves the icon as it was away from its corner', () => {
  const size = 16;
  const icon = Buffer.alloc(size * size * 4);
  for (let i = 0; i < icon.length; i += 4) icon.set([10, 120, 40, 255], i);
  const dotted = withDot(icon, size);
  assert.deepEqual(px(dotted, size, 0, size - 1), px(icon, size, 0, size - 1), 'the far corner is untouched');
  const top = px(dotted, size, size - 3, 3);
  assert.deepEqual([top.r, top.g, top.b, top.a], [BADGE_RED.r, BADGE_RED.g, BADGE_RED.b, 255], 'the dot sits in the top corner');
  assert.equal(icon[0], 10, 'the original bitmap is not changed');
  assert.throws(() => withDot(Buffer.alloc(10), size));
});

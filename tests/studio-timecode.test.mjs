// The transport's time (src/lib/studio/time.ts timecode, shown twice by the stage) reads the frame the stage shows.
// Found by qa/studio-copy-swap.cjs on 2026-11-04: at 30 frames a second, one «إطار للأمام» from 0 drew frame 1 and read
// 00:00.00, because frame 1 starts at 33,333 µs, a microsecond-rounded start that frameAt alone gives to frame 0. The
// time now takes its frame by the export's rule (frameShown, a microsecond) and counts a second in whole frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import { US } from '../src/lib/studio/schema.ts';
import { frameAt, frameShown, frameStart, secondFrames, stepFrames, timecode } from '../src/lib/studio/time.ts';
import { playerTime } from '../src/lib/work/review-keys.ts';

const RATES = [24, 25, 30, 30000 / 1001, 60];
const PRESSES = 100;
const name = (fps) => (Number.isInteger(fps) ? String(fps) : fps.toFixed(2));
const two = (n) => String(n).padStart(2, '0');

// frame n written out by hand: a second is secondFrames(fps) frames (30 at 29.97, as a timecode without dropped frames)
const label = (n, fps) => {
  const per = secondFrames(fps);
  const sec = Math.floor(n / per);
  return `${two(Math.floor(sec / 60))}:${two(sec % 60)}.${two(n % per)}`;
};

// the transport's time before this change, kept here to show what it read
const before = (us, fps) => {
  const f = frameAt(us, fps);
  const sec = Math.floor(f / fps);
  return `${two(Math.floor(sec / 60))}:${two(sec % 60)}.${two(f - sec * fps)}`;
};

test('before: one «إطار للأمام» from 0 at 30 frames a second read 00:00.00 while the stage drew frame 1', () => {
  const t = stepFrames(0, 1, 30);
  assert.equal(t, 33_333);
  assert.equal(frameShown(t, 30), 1);
  assert.equal(before(t, 30), '00:00.00');
  assert.equal(timecode(t, 30), '00:00.01');
});

for (const fps of RATES) {
  test(`${name(fps)} frames a second: after n presses of «إطار للأمام» from 0 the time reads frame n, n = 0 to ${PRESSES}`, () => {
    let t = 0;
    for (let n = 0; n <= PRESSES; n++) {
      if (n) t = stepFrames(t, 1, fps);
      assert.equal(timecode(t, fps), label(n, fps), `after ${n} presses`);
      assert.equal(frameShown(t, fps), n, `after ${n} presses`);
    }
  });
}

test('the old time misread some of those frames at every rate whose frame starts round down', () => {
  const misread = (fps) => {
    let t = 0;
    let wrong = 0;
    for (let n = 1; n <= PRESSES; n++) {
      t = stepFrames(t, 1, fps);
      if (before(t, fps) !== label(n, fps)) wrong++;
    }
    return wrong;
  };
  // 25 has whole-microsecond frames (40,000 µs), so it alone read right
  assert.equal(misread(25), 0);
  for (const fps of [24, 30, 30000 / 1001, 60]) assert.ok(misread(fps) > 0, `${name(fps)} misread none`);
});

test('a second and a minute: the frame count rolls over at secondFrames, and hours appear only when needed', () => {
  assert.equal(timecode(frameStart(30, 30), 30), '00:01.00');
  assert.equal(timecode(frameStart(29, 30), 30), '00:00.29');
  assert.equal(timecode(frameStart(100, 30), 30), '00:03.10');
  assert.equal(timecode(frameStart(30, 30000 / 1001), 30000 / 1001), '00:01.00');
  assert.equal(timecode(frameStart(60 * 60, 60), 60), '01:00.00');
  assert.equal(timecode(3725 * US, 30), '1:02:05.00');
  assert.equal(timecode(65 * US + 12 * 40_000, 25), '01:05.12');
  assert.equal(timecode(-frameStart(1, 30), 30), '-00:00.01');
});

test('the export\'s rule at a frame\'s edge: a microsecond before a start reads that frame, two read the one before', () => {
  for (const fps of RATES) {
    for (const n of [1, 2, 29, 31, 99]) {
      assert.equal(timecode(frameStart(n, fps) - 1, fps), label(n, fps), `${name(fps)}: 1 µs before frame ${n}`);
      assert.equal(timecode(frameStart(n, fps) - 2, fps), label(n - 1, fps), `${name(fps)}: 2 µs before frame ${n}`);
    }
  }
});

test('the review player reads tenths of a second, not frames, and a frame start shows its own tenth', () => {
  // review-player.tsx shows playerTime of the element's time, with a tenth's thousandth (100 µs) of room for a seek
  // that lands a hair early. No frame start at these rates lies within that room below a tenth, so the same holds there.
  for (const fps of RATES) {
    for (let n = 0; n <= PRESSES; n++) {
      const tenth = fps === 30000 / 1001 ? Math.floor((n * 10 * 1001) / 30000) : Math.floor((n * 10) / fps);
      const want = `${two(Math.floor(tenth / 600))}:${two(Math.floor((tenth % 600) / 10))}.${tenth % 10}`;
      assert.equal(playerTime(frameStart(n, fps) / US), want, `${name(fps)}: frame ${n}`);
    }
  }
});

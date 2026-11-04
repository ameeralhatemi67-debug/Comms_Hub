// Stepping the playhead by frames and seconds (src/lib/studio/time.ts stepFrames, used by the stage's «إطار للأمام»,
// «إطار للخلف», «تقدم ثانية» and «رجوع ثانية» and the editor's frame keys). Found by qa/studio-copy-swap.cjs on
// 2026-11-04: four presses of «تقدم ثانية» at 30 frames a second ended on frame 119, because each press added
// 30 x 33,333 µs, a frame length rounded to whole microseconds. A step now goes in whole frames from the frame shown.
import test from 'node:test';
import assert from 'node:assert/strict';
import { frameAt, frameShown, frameStart, frameUs, secondFrames, stepFrames } from '../src/lib/studio/time.ts';

const RATES = [24, 25, 30, 30000 / 1001, 60];
const PRESSES = 100;
const name = (fps) => (Number.isInteger(fps) ? String(fps) : fps.toFixed(2));

test('the old step added a rounded frame length each press: four seconds at 30 frames a second ended on frame 119', () => {
  let t = 0;
  for (let i = 0; i < 4; i++) t += 30 * frameUs(30);
  assert.equal(t, 3_999_960);
  assert.equal(frameAt(t, 30), 119);
});

for (const fps of RATES) {
  for (const [label, size] of [['a frame', 1], ['a second', secondFrames(fps)]]) {
    test(`${name(fps)} frames a second: ${PRESSES} steps of ${label} forward, then back, each on its exact frame`, () => {
      let t = 0;
      for (let k = 1; k <= PRESSES; k++) {
        t = stepFrames(t, size, fps);
        assert.equal(t, frameStart(k * size, fps), `forward press ${k}`);
        assert.equal(frameShown(t, fps), k * size, `forward press ${k}`);
      }
      for (let k = PRESSES - 1; k >= 0; k--) {
        t = stepFrames(t, -size, fps);
        assert.equal(t, frameStart(k * size, fps), `back to ${k} steps`);
        assert.equal(frameShown(t, fps), k * size, `back to ${k} steps`);
      }
      assert.equal(t, 0);
    });
  }
}

test('a second is whole frames: the rate, and 30 at 29.97', () => {
  assert.deepEqual(RATES.map(secondFrames), [24, 25, 30, 30, 60]);
});

test('every frame start shows its own frame, though a rounded start lies below its exact time', () => {
  for (const fps of RATES) {
    for (let n = 0; n <= 20_000; n++) assert.equal(frameShown(frameStart(n, fps), fps), n, `${name(fps)}: frame ${n}`);
  }
  // frameAt alone gives such a start to the frame before (1/30 s rounds down to 33,333 µs)
  assert.equal(frameStart(1, 30), 33_333);
  assert.equal(frameAt(33_333, 30), 0);
  assert.equal(frameShown(33_333, 30), 1);
});

test('the export\'s rule at a frame\'s edge: a microsecond before the next start is the next frame, two are not', () => {
  for (const fps of RATES) {
    for (const n of [0, 1, 7, 29, 1000]) {
      const next = frameStart(n + 1, fps);
      assert.equal(frameShown(next - 1, fps), n + 1, `${name(fps)}: 1 µs before frame ${n + 1}`);
      assert.equal(frameShown(next - 2, fps), n, `${name(fps)}: 2 µs before frame ${n + 1}`);
    }
  }
});

test('from inside a frame a step lands on a frame start, and never before 0', () => {
  for (const fps of RATES) {
    const mid = frameStart(5, fps) + Math.floor(frameUs(fps) / 2);
    assert.equal(stepFrames(mid, 1, fps), frameStart(6, fps));
    assert.equal(stepFrames(mid, -1, fps), frameStart(4, fps));
    assert.equal(stepFrames(mid, 0, fps), frameStart(5, fps));
    assert.equal(stepFrames(0, -1, fps), 0);
    assert.equal(stepFrames(frameStart(3, fps), -secondFrames(fps), fps), 0);
  }
});

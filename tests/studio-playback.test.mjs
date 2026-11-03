// Playing the preview at the machine's strength (src/lib/studio/playback.ts; Desktop_Power_Ideas.md P-03 and P-04, phase
// D10): «تلقائية» steps down on a run of missed frames and up after a calm run, never back to a level that missed in the
// same play; the stream budget keeps the largest streams on their source and sends the rest to their light copy, and
// with no profile every copy plays as it always did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_CALM, AUTO_SETTLE, AUTO_WINDOW, AutoLevel, startLevel, stepOf, STREAM_MARGIN, streamBudget, streamPlan, UHD30 } from '../src/lib/studio/playback.ts';
import { PREVIEW_STEPS } from '../src/lib/studio/scale.ts';

/** Plays `ms` milliseconds at 60 draws a second (30 fps project): `miss(t)` says how many frames each draw missed. */
function play(a, from, ms, miss = () => 0) {
  const changes = [];
  for (let t = from; t < from + ms; t += 1000 / 60) {
    const c = a.frame(t, 0.5, miss(t));
    if (c !== null) changes.push([Math.round(t), c]);
  }
  return changes;
}

test('the start: the step of the plan\'s share, or the remembered one', () => {
  assert.equal(stepOf(PREVIEW_STEPS, 1), 0);
  assert.equal(stepOf(PREVIEW_STEPS, 0.5), 1);
  assert.equal(stepOf(PREVIEW_STEPS, 0.25), 2);
  assert.equal(stepOf(PREVIEW_STEPS, 0.3), 2);
  assert.equal(new AutoLevel(PREVIEW_STEPS, 9).level, 2);
  assert.equal(new AutoLevel(PREVIEW_STEPS, 1).value, 0.5);
});

test('a calm play stays where it starts, at full', () => {
  const a = new AutoLevel(PREVIEW_STEPS, 0);
  a.start(0);
  assert.deepEqual(play(a, 0, 20000), []);
  assert.equal(a.value, 1);
});

test('a run of missed frames steps down within a window, and the settling after a change is not judged', () => {
  const a = new AutoLevel(PREVIEW_STEPS, 0);
  a.start(0);
  // every other draw misses a frame from the start of the play
  const ch = play(a, 0, 3000, (t) => (Math.round(t / (1000 / 60)) % 2 ? 1 : 0));
  assert.equal(ch[0][1], 1);
  assert.ok(ch[0][0] <= AUTO_SETTLE + AUTO_WINDOW + 20, `first step at ${ch[0][0]}`);
  assert.equal(ch[1][1], 2);
  assert.ok(ch[1][0] - ch[0][0] >= AUTO_SETTLE, 'a step waits for the settling');
  assert.equal(ch.length, 2, 'the lowest step is the last');
});

test('one missed frame now and then is not a run', () => {
  const a = new AutoLevel(PREVIEW_STEPS, 0);
  a.start(0);
  assert.deepEqual(play(a, 0, 20000, (t) => (Math.round(t) % 1000 < 17 ? 1 : 0)), []);
});

test('calm seconds step up again, but never back to a level that missed in the same play', () => {
  const a = new AutoLevel(PREVIEW_STEPS, 2);
  a.start(0);
  const up = play(a, 0, 12000);
  assert.deepEqual(up.map((c) => c[1]), [1, 0]);
  assert.ok(up[0][0] >= AUTO_CALM);
  // misses at full, then at a half: down to a quarter; then calm: it stays there for the rest of the play
  const down = play(a, 12000, 1500, () => 1);
  assert.deepEqual(down.map((c) => c[1]), [1, 2]);
  assert.deepEqual(play(a, 13500, 20000), []);
  assert.equal(a.level, 2, 'not back to a level that missed in the same play');
  // misses at full only: back to a half after the calm, never to full
  a.start(34000);
  const b = new AutoLevel(PREVIEW_STEPS, 0);
  b.start(0);
  assert.deepEqual(play(b, 0, 800, () => 1).map((c) => c[1]), [1]);
  assert.deepEqual(play(b, 800, 20000), []);
  assert.equal(b.level, 1);
  // a new play may try full again after its calm run
  a.start(40000);
  play(a, 40000, AUTO_CALM * 3);
  assert.equal(a.level, 0);
});

test('the stream budget: 4K decoding over 30 frames, with a margin, lowered when drawing is slow; none with no profile', () => {
  assert.equal(streamBudget(null), null);
  const p = (hw, sw, effects) => ({ decode: { h264_2160: { hw, sw } }, compose: { effects } });
  // a third of the measured rate: media elements decoding several streams at once carry far less than one measured alone
  assert.equal(STREAM_MARGIN, 1 / 3);
  assert.equal(streamBudget(p(187, 102.8, 7)), (187 / 30) * STREAM_MARGIN);
  assert.equal(streamBudget(p(null, 102.8, 7)), (102.8 / 30) * STREAM_MARGIN);
  assert.equal(streamBudget(p(100, 50, 24)), (100 / 30) * STREAM_MARGIN * 0.5);
  assert.equal(streamBudget(p(null, null, 7)), null);
  assert.ok(streamBudget(p(200, 1, 5)) > streamBudget(p(100, 1, 5)), 'faster decoding never a smaller budget');
});

test('which streams play their copy: the largest keep their source within the budget, a stream with no copy always its source', () => {
  const s = (clip, area, copy = true, pixels = UHD30) => ({ clip, pixels, area, copy });
  const three = [s('a', 0.25), s('b', 1), s('c', 0.5)];
  assert.deepEqual([...streamPlan(three, 4.6)], []);
  assert.deepEqual([...streamPlan(three, 2.5)], ['a']);
  assert.deepEqual([...streamPlan(three, 0.9)].sort(), ['a', 'b', 'c']);
  // no copy: played from the source whatever the budget
  assert.deepEqual([...streamPlan([s('a', 0.25), s('b', 1, false), s('c', 0.5)], 1)].sort(), ['a', 'c']);
  // no profile: every copy plays, as D5 did
  assert.deepEqual([...streamPlan(three, null)].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...streamPlan([s('a', 1, false)], null)], []);
  // a 1080p stream costs a quarter of a 4K one
  assert.deepEqual([...streamPlan([s('a', 1), s('b', 0.5, true, UHD30 / 4)], 1.25)], []);
});

test('a play starts no higher than the streams at the playhead allow; a lower remembered level is kept', () => {
  assert.equal(startLevel(0), 0);
  assert.equal(startLevel(1), 0);
  assert.equal(startLevel(1.5), 1);
  assert.equal(startLevel(3), 2);
  const a = new AutoLevel(PREVIEW_STEPS, 0);
  a.atLeast(startLevel(3));
  assert.equal(a.value, 0.25);
  const b = new AutoLevel(PREVIEW_STEPS, 2);
  b.atLeast(startLevel(0.5));
  assert.equal(b.value, 0.25);
  b.atLeast(9);
  assert.equal(b.level, 2);
});

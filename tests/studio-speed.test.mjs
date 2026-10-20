// The studio, third round, Phase 2 (MVP_draft.md 62.7): speed, ramps, reverse and stills, as one
// calculation from timeline time to source time, and the timeline's trims, cuts and the freeze built on
// it. Exact to the microsecond where the preview and the export must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { area, sourceTime, sourceSpan, lengthForSpan, timeForArea, maxLengthFor, retimed, speedAt, isHold } from '../src/lib/studio/speed.ts';
import { addClip, addSource, locate, trimStart, trimEnd, splitClip, setSpeed, setSpeedKeys, setReverse, insertHold, audibleAt, maxLengthOf } from '../src/lib/studio/timeline.ts';
import { frameStart } from '../src/lib/studio/time.ts';
import { hasSound } from '../src/lib/studio/audio.ts';

const A = '11111111-1111-4111-8111-111111111111';
const clip = (over = {}) => ({ id: 'c', start: 0, length: 4 * US, in: 0, ...over });

/** A project with one 10 s video source and one clip of it. */
function project(over = {}) {
  let doc = newVideoDoc('9:16', 30);
  const s = addSource(doc, { kind: 'library', asset: A, version: 1, name: 'لقطة', media: 'video', duration: 10 * US });
  doc = s.doc;
  const r = addClip(doc, { source: s.id, start: 0, length: 4 * US, in: 0, ...over });
  return { doc: r.doc, id: r.clipId, src: s.id };
}

test('a constant speed: source time runs at that rate, and the stretch shown is length times speed', () => {
  const c = clip({ speed: 2, in: 1 * US });
  assert.equal(sourceTime(c, 1 * US), 3 * US);
  assert.equal(sourceSpan(c), 8 * US);
  assert.equal(lengthForSpan(c, 8 * US), 4 * US);
  assert.ok(retimed(c));
  assert.ok(!retimed(clip()));
});

test('a ramp: straight between speed points, flat outside them, a held point a step', () => {
  const c = clip({ keys: { speed: [{ t: 0, v: 1 }, { t: 2 * US, v: 3 }] } });
  assert.equal(area(c, 0, 2 * US), 4 * US, 'trapezoid (1 + 3) / 2 x 2 s');
  assert.equal(sourceTime(c, 1 * US), 1.5 * US, 'half way the rate is 2: (1 + 2) / 2 x 1 s');
  assert.equal(area(c, 0, 3 * US), 7 * US, 'after the last point the rate stays 3');
  assert.equal(speedAt(c, 1 * US), 2);
  const held = clip({ keys: { speed: [{ t: 0, v: 1, ease: 'hold' }, { t: 1 * US, v: 4 }] } });
  assert.equal(area(held, 0, 1 * US), 1 * US);
  assert.equal(area(held, 0, 2 * US), 5 * US);
  // the inverse finds the clip time that covers a given stretch
  const tau = timeForArea(c, 0, 4 * US);
  assert.ok(Math.abs(tau - 2 * US) <= 1, String(tau));
  assert.ok(Math.abs(area(c, 0, timeForArea(c, 0, 2.2 * US)) - 2.2 * US) < 2);
});

test('rates are kept between 0.1 and 8, whatever a stored document says', () => {
  assert.equal(speedAt(clip({ speed: 50 }), 0), 8);
  assert.equal(speedAt(clip({ keys: { speed: [{ t: 0, v: 0 }] } }), 0), 0.1);
});

test('reversed: the same stretch from its end back to its start; a still stays on its frame', () => {
  const r = clip({ in: 1 * US, length: 2 * US, reverse: true });
  assert.equal(sourceTime(r, 0), 3 * US - 1, 'starts a microsecond inside the end of its stretch');
  assert.equal(sourceTime(r, 2 * US), 1 * US, 'ends on in');
  assert.equal(sourceTime(r, 0.5 * US), 2.5 * US - 1);
  const h = clip({ hold: 3.2 * US, length: 2 * US });
  assert.ok(isHold(h) && retimed(h));
  assert.equal(sourceTime(h, 1.7 * US), 3.2 * US);
  assert.equal(sourceSpan(h), 0);
  assert.equal(maxLengthFor(h, 10 * US), Number.POSITIVE_INFINITY, 'a still may be as long as wanted');
});

test('the longest a re-timed clip may be: to the end of its source, or (reversed) to its start', () => {
  assert.equal(maxLengthFor(clip({ speed: 2, in: 2 * US }), 10 * US), 4 * US);
  // reversed at 2x from in 2 s for 2 s: its stretch ends at 6 s, so its end may reach the source's start
  assert.equal(maxLengthFor(clip({ speed: 2, in: 2 * US, length: 2 * US, reverse: true }), 10 * US), 3 * US);
});

test('frames at 24, 25, 30 and 60 per second land on exact microseconds at 1.5x', () => {
  for (const fps of [24, 25, 30, 60]) {
    const c = clip({ speed: 1.5, length: 10 * US });
    for (const n of [0, 1, 7, 59, 120]) {
      const t = frameStart(n, fps);
      assert.equal(sourceTime(c, t), Math.round(1.5 * t), `${fps} fps frame ${n}`);
    }
  }
});

test('trimming a re-timed clip moves through its source at its speed; reversed, the other edge moves', () => {
  const { doc, id } = project({ speed: 2 });
  const a = locate(trimStart(doc, id, 1 * US), id).clip;
  assert.equal(a.start, 1 * US);
  assert.equal(a.length, 3 * US);
  assert.equal(a.in, 2 * US, 'one second of timeline is two of source');
  // reversed: trimming the start leaves in where it was; trimming the end moves in
  const r = project({ reverse: true, in: 1 * US });
  const b = locate(trimStart(r.doc, r.id, 1 * US), r.id).clip;
  assert.equal(b.in, 1 * US);
  assert.equal(sourceTime(b, b.start), 4 * US - 1, 'still shows the same frame at the same moment');
  const e = locate(trimEnd(r.doc, r.id, 3 * US), r.id).clip;
  assert.equal(e.length, 3 * US);
  assert.equal(e.in, 2 * US, 'the stretch ends at 5 s as before, so its start moves to 2 s');
  assert.equal(sourceTime(e, 0), 5 * US - 1);
});

test('cutting a ramp or a reversed clip keeps the picture continuous across the cut', () => {
  const ramp = project({ keys: { speed: [{ t: 0, v: 1 }, { t: 4 * US, v: 2 }] } });
  const cut = 1.5 * US;
  const s1 = splitClip(ramp.doc, ramp.id, cut);
  const first = locate(s1.doc, ramp.id).clip;
  const second = locate(s1.doc, s1.secondId).clip;
  assert.ok(Math.abs(sourceTime(first, cut - 1) - sourceTime(second, cut)) <= 2, `${sourceTime(first, cut - 1)} ${sourceTime(second, cut)}`);
  assert.equal(second.keys.speed[0].t, 0, 'the second part starts its ramp at its own start');
  assert.equal(speedAt(second, 0), speedAt(locate(ramp.doc, ramp.id).clip, cut));
  const rev = project({ reverse: true, in: 1 * US });
  const s2 = splitClip(rev.doc, rev.id, cut);
  const f2 = locate(s2.doc, rev.id).clip;
  const g2 = locate(s2.doc, s2.secondId).clip;
  assert.ok(Math.abs(sourceTime(f2, cut - 1) - sourceTime(g2, cut)) <= 2, `${sourceTime(f2, cut - 1)} ${sourceTime(g2, cut)}`);
  assert.equal(g2.in, 1 * US, 'the second part ends where the whole clip ended');
});

test('a new constant speed keeps the stretch, within the room before the next clip and the source', () => {
  const { doc, id, src } = project();
  assert.equal(locate(setSpeed(doc, id, 2), id).clip.length, 2 * US);
  const withNext = addClip(doc, { source: src, start: 5 * US, length: 1 * US, in: 0 }).doc;
  const slow = locate(setSpeed(withNext, id, 0.5), id).clip;
  assert.equal(slow.length, 5 * US, 'eight seconds wanted, five before the next clip');
  assert.equal(slow.speed, 0.5);
  assert.equal(locate(setSpeed(setSpeed(doc, id, 2), id, 1), id).clip.speed, undefined, '1x is stored as no speed');
  // a ramp that would run past the source is cut back to it
  const fast = locate(setSpeedKeys(doc, id, { speed: [{ t: 0, v: 4 }] }), id).clip;
  assert.equal(fast.length, 2.5 * US);
  assert.equal(maxLengthOf(doc, fast), 2.5 * US);
});

test('re-timed clips are silent in the preview and in the export', () => {
  const { doc, id } = project();
  assert.equal(audibleAt(doc, 1 * US).length, 1);
  assert.ok(hasSound(doc));
  const fast = setSpeed(doc, id, 2);
  assert.equal(audibleAt(fast, 1 * US).length, 0);
  assert.ok(!hasSound(fast));
  assert.equal(audibleAt(setReverse(doc, id, true), 1 * US).length, 0);
});

test('«تجميد الإطار»: the clip is cut, a two-second still of that frame goes in, the rest moves on', () => {
  const p = project({ speed: 2 });
  const after = addClip(p.doc, { source: p.src, start: 4 * US, length: 1 * US, in: 0 }).doc;
  const r = insertHold(after, p.id, 1 * US);
  assert.ok(r.holdId);
  const still = locate(r.doc, r.holdId).clip;
  assert.equal(still.start, 1 * US);
  assert.equal(still.length, 2 * US);
  assert.equal(still.hold, 2 * US, 'the frame shown at 1 s at 2x');
  assert.ok(still.mute && isHold(still));
  const track = r.doc.video.tracks.find((t) => t.clips.some((c) => c.id === r.holdId));
  const starts = track.clips.map((c) => c.start / US);
  assert.deepEqual(starts, [0, 1, 3, 6], 'first part, still, second part, the clip that followed');
  assert.equal(insertHold(after, p.id, 9 * US).holdId, null, 'no still where the clip is not');
});

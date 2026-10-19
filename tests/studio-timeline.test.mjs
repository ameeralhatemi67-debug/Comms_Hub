// The studio's engine rules that need no browser (Studio_Build_Plan.md Phase 3): time and frames,
// undo and redo, timeline operations (add, move, trim, split, delete, ripple, duplicate, cross-fade,
// snapping, tracks), the motion templates as clips (length to showcase, template time, parameters),
// Arabic line breaking, SRT captions, and the device cache's ten-day rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US, TRACK_LIMITS } from '../src/lib/studio/schema.ts';
import { frameUs, frameAt, snapFrame, frameCount, timecode, parseMmSs } from '../src/lib/studio/time.ts';
import { historyOf, record, undo, redo, historyKey, HISTORY_LIMIT, JOIN_MS } from '../src/lib/studio/history.ts';
import {
  addClip, moveClip, trimStart, trimEnd, splitClip, removeClip, duplicateClip, setTransition, snapPoints, snapTo, visibleAt, audibleAt,
  clipAlpha, clipGain, addSource, pruneSources, locate, addTrack, removeTrack, legalStart, fits, minLength,
} from '../src/lib/studio/timeline.ts';
import { graphicById, motionParams, naturalLength, fitToLength, templateTime, changedParams, motionClip, motionCatalog, minMotionLength } from '../src/lib/studio/motion-adapter.ts';
import { timingOf } from '../src/lib/motion/renderers.js';
import { wrap, paragraphDir, parseSrt, textMotion, defaultText } from '../src/lib/studio/text.ts';
import { dueForSweep, nextRange, totalFromRange, TEN_DAYS, PART, libraryName } from '../src/lib/studio/cache.ts';

const A = '11111111-1111-4111-8111-111111111111';
/** A project with one 10 s video source and one picture source. */
function project() {
  let d = newVideoDoc('9:16', 30);
  let r = addSource(d, { kind: 'library', asset: A, version: 1, name: 'مقطع', media: 'video', duration: 10 * US, w: 1920, h: 1080 });
  d = r.doc;
  const vid = r.id;
  r = addSource(d, { kind: 'library', asset: A, version: 2, name: 'صورة', media: 'image', w: 800, h: 800 });
  return { doc: r.doc, vid, img: r.id };
}
const clipsOf = (doc, kind = 'video', i = 0) => doc.video.tracks.filter((t) => t.kind === kind)[i].clips;

test('frames and time codes at 30 and 25 frames a second', () => {
  assert.equal(frameUs(30), 33333);
  assert.equal(frameAt(US, 30), 30);
  assert.equal(frameAt(999_999, 30), 29);
  assert.equal(snapFrame(1_010_000, 30), 1_000_000);
  assert.equal(frameCount(2 * US, 30), 60);
  assert.equal(frameCount(2 * US + 1, 30), 61);
  assert.equal(timecode(65 * US + 12 * 40_000, 25), '01:05.12');
  assert.equal(timecode(3725 * US, 30), '1:02:05.00');
  assert.equal(parseMmSs('01:30'), 90 * US);
  assert.equal(parseMmSs('1:3'), null);
});

test('undo and redo: steps, joined steps of one control, the limit, and the keys', () => {
  let h = historyOf('a');
  h = record(h, 'b', 'نقل', null, 0);
  h = record(h, 'c', 'حجم', 'scale', 1000);
  h = record(h, 'd', 'حجم', 'scale', 1000 + JOIN_MS - 1);
  assert.deepEqual(h.past.map((p) => p.doc), ['a', 'b'], 'the slider drag is one step');
  h = undo(h);
  assert.equal(h.present, 'b');
  h = redo(h);
  assert.equal(h.present, 'd');
  h = undo(undo(h));
  assert.equal(h.present, 'a');
  h = record(h, 'x', 'نص', null, 5000);
  assert.equal(h.future.length, 0, 'a new change clears what could be redone');
  let big = historyOf(0);
  for (let i = 1; i <= HISTORY_LIMIT + 50; i++) big = record(big, i, 'خطوة', null, i * 10_000);
  assert.equal(big.past.length, HISTORY_LIMIT);
  const k = { ctrlKey: true, metaKey: false, shiftKey: false, key: 'z' };
  assert.equal(historyKey(k, { tagName: 'DIV' }), 'undo');
  assert.equal(historyKey({ ...k, shiftKey: true }, { tagName: 'DIV' }), 'redo');
  assert.equal(historyKey({ ...k, key: 'y' }, { tagName: 'DIV' }), 'redo');
  assert.equal(historyKey(k, { tagName: 'INPUT' }), null, 'a text field keeps its own undo');
});

test('adding clips: on the track of their kind, then a free track, a new track within the limit, else at the end', () => {
  let { doc, vid, img } = project();
  let r = addClip(doc, { source: vid, start: 0, length: 4 * US });
  doc = r.doc;
  assert.equal(locate(doc, r.clipId).track.kind, 'video');
  r = addClip(doc, { source: img, start: US, length: 2 * US });
  doc = r.doc;
  assert.equal(doc.video.tracks.filter((t) => t.kind === 'video').length, 2, 'it overlapped, so a second video track was made');
  r = addClip(doc, { source: img, start: US, length: 2 * US });
  doc = r.doc;
  assert.equal(doc.video.tracks.filter((t) => t.kind === 'video').length, 3);
  r = addClip(doc, { source: img, start: US, length: 2 * US });
  doc = r.doc;
  assert.equal(doc.video.tracks.filter((t) => t.kind === 'video').length, TRACK_LIMITS.video, 'no fourth track');
  assert.equal(locate(doc, r.clipId).clip.start, 4 * US, 'placed at the end of the first track');
  r = addClip(doc, { text: defaultText('عنوان'), start: 0, length: 2 * US });
  assert.equal(locate(r.doc, r.clipId).track.kind, 'text');
  r = addClip(doc, motionClip(graphicById('count-up'), '9:16'));
  assert.equal(locate(r.doc, r.clipId).track.kind, 'graphics');
  const order = r.doc.video.tracks.map((t) => t.kind);
  assert.deepEqual(order, ['video', 'video', 'video', 'graphics', 'text', 'audio'], 'drawing order kept: video, graphics, text, sound');
});

test('moving a clip: anywhere free, never onto another clip, never onto a track of another kind', () => {
  let { doc, vid, img } = project();
  const a = addClip(doc, { source: vid, start: 0, length: 3 * US });
  const b = addClip(a.doc, { source: img, start: 5 * US, length: 2 * US });
  doc = b.doc;
  const moved = moveClip(doc, b.clipId, 3 * US);
  assert.equal(locate(moved, b.clipId).clip.start, 3 * US);
  assert.equal(moveClip(doc, b.clipId, 2 * US), doc, 'onto the first clip: unchanged');
  const tTrack = doc.video.tracks.find((t) => t.kind === 'text').id;
  assert.equal(moveClip(doc, b.clipId, 8 * US, tTrack), doc, 'not onto the text track');
  const track = locate(doc, b.clipId).track;
  assert.equal(legalStart(track, locate(doc, b.clipId).clip, 2 * US), 3 * US, 'the nearest free place');
});

test('trimming: the start edge reaches no earlier than the source start, the end no later than its end', () => {
  let { doc, vid } = project();
  const r = addClip(doc, { source: vid, start: 2 * US, length: 4 * US, in: US });
  doc = r.doc;
  let t = trimStart(doc, r.clipId, 0);
  let c = locate(t, r.clipId).clip;
  assert.deepEqual([c.start, c.in, c.length], [US, 0, 5 * US], 'stopped where the source begins');
  t = trimStart(doc, r.clipId, 3 * US);
  c = locate(t, r.clipId).clip;
  assert.deepEqual([c.start, c.in, c.length], [3 * US, 2 * US, 3 * US]);
  t = trimEnd(doc, r.clipId, 20 * US);
  c = locate(t, r.clipId).clip;
  assert.equal(c.in + c.length, 10 * US, 'stopped where the source ends');
  t = trimEnd(doc, r.clipId, 2 * US);
  assert.equal(locate(t, r.clipId).clip.length, minLength(doc), 'at least one frame');
});

test('splitting: two clips, the second continuing in the source; not within a frame of an edge', () => {
  let { doc, vid } = project();
  const r = addClip(doc, { source: vid, start: US, length: 6 * US, in: US, fadeIn: 500_000, fadeOut: 500_000 });
  doc = r.doc;
  const s = splitClip(doc, r.clipId, 3 * US);
  const [a, b] = clipsOf(s.doc);
  assert.deepEqual([a.start, a.length, a.in, a.fadeOut], [US, 2 * US, US, 0]);
  assert.deepEqual([b.start, b.length, b.in, b.fadeIn], [3 * US, 4 * US, 3 * US, 0]);
  assert.notEqual(a.id, b.id);
  assert.equal(splitClip(doc, r.clipId, US + 10).secondId, null);
  assert.equal(doc.video.tracks[0].clips.length, 1, 'the original document is untouched');
});

test('deleting, with and without closing the gap; duplicating after the original', () => {
  let { doc, vid, img } = project();
  const a = addClip(doc, { source: vid, start: 0, length: 2 * US });
  const b = addClip(a.doc, { source: img, start: 2 * US, length: 3 * US });
  const c = addClip(b.doc, { source: img, start: 5 * US, length: 1 * US });
  doc = c.doc;
  assert.equal(locate(removeClip(doc, b.clipId), c.clipId).clip.start, 5 * US);
  assert.equal(locate(removeClip(doc, b.clipId, true), c.clipId).clip.start, 2 * US, 'ripple closes the gap');
  const d = duplicateClip(doc, a.clipId);
  assert.ok(locate(d.doc, d.clipId).clip.start >= 6 * US || locate(d.doc, d.clipId).track.id !== locate(doc, a.clipId).track.id, 'a copy fits where it lands');
});

test('a cross-fade overlaps the clip before by its length and fades both picture and sound', () => {
  let { doc, vid } = project();
  const a = addClip(doc, { source: vid, start: 0, length: 3 * US });
  const b = addClip(a.doc, { source: vid, start: 3 * US, length: 3 * US, in: 3 * US });
  const c = addClip(b.doc, { source: vid, start: 6 * US, length: 2 * US, in: 6 * US });
  doc = setTransition(c.doc, b.clipId, US);
  let B = locate(doc, b.clipId).clip;
  assert.equal(B.start, 2 * US, 'moved back by the fade');
  assert.equal(locate(doc, c.clipId).clip.start, 5 * US, 'and the clips after it with it');
  assert.ok(fits(locate(doc, b.clipId).track, B), 'the overlap is allowed by the fade');
  assert.equal(clipAlpha(B, 2.5 * US), 0.5);
  const track = locate(doc, a.clipId).track;
  const A2 = locate(doc, a.clipId).clip;
  const sum = clipGain(track, A2, 2.5 * US) ** 2 + clipGain(track, B, 2.5 * US) ** 2;
  assert.ok(Math.abs(sum - 1) < 1e-9, 'equal power: the level does not dip');
  assert.equal(visibleAt(doc, 2.5 * US).length, 2, 'both are drawn during the fade');
  assert.equal(setTransition(doc, b.clipId, 10 * US) !== doc, true);
  assert.equal(locate(setTransition(doc, b.clipId, 10 * US), b.clipId).clip.transition.length, 1.5 * US, 'at most half of the shorter clip');
  const off = setTransition(doc, b.clipId, null);
  assert.equal(locate(off, b.clipId).clip.start, 3 * US, 'removing it moves them forward again');
  assert.equal(locate(off, c.clipId).clip.start, 6 * US);
});

test('snapping to clip edges and the playhead within a tolerance', () => {
  let { doc, vid } = project();
  const a = addClip(doc, { source: vid, start: 0, length: 2 * US });
  const b = addClip(a.doc, { source: vid, start: 5 * US, length: 2 * US });
  const pts = snapPoints(b.doc, b.clipId, [3.3 * US]);
  assert.deepEqual(pts, [0, 2 * US, 3.3 * US]);
  assert.equal(snapTo(2.05 * US, pts, 0.1 * US), 2 * US);
  assert.equal(snapTo(2.5 * US, pts, 0.1 * US), 2.5 * US);
});

test('what is seen and heard: hidden tracks are not drawn, muted clips and tracks are not heard', () => {
  let { doc, vid } = project();
  const a = addClip(doc, { source: vid, start: 0, length: 2 * US });
  doc = a.doc;
  assert.equal(visibleAt(doc, US).length, 1);
  assert.equal(audibleAt(doc, US).length, 1);
  const hidden = { ...doc, video: { ...doc.video, tracks: doc.video.tracks.map((t, i) => (i === 0 ? { ...t, hidden: true, muted: true } : t)) } };
  assert.equal(visibleAt(hidden, US).length, 0);
  assert.equal(audibleAt(hidden, US).length, 0);
  assert.equal(clipAlpha({ start: 0, length: 2 * US, fadeIn: US }, 0.25 * US), 0.25);
  assert.equal(clipAlpha({ start: 0, length: 2 * US, fadeOut: US }, 1.75 * US), 0.25);
});

test('tracks: added within the limit, removed only when empty and not the last of its kind', () => {
  const { doc } = project();
  const two = addTrack(doc, 'text');
  assert.equal(two.video.tracks.filter((t) => t.kind === 'text').length, 2);
  assert.equal(addTrack(two, 'text'), two, 'two text tracks at most');
  const extra = two.video.tracks.filter((t) => t.kind === 'text')[1];
  assert.equal(removeTrack(two, extra.id).video.tracks.filter((t) => t.kind === 'text').length, 1);
  const only = doc.video.tracks.find((t) => t.kind === 'audio');
  assert.equal(removeTrack(doc, only.id), doc, 'the last sound track stays');
});

test('sources: added once per file and version, and dropped when nothing uses them', () => {
  let { doc, vid } = project();
  const again = addSource(doc, { kind: 'library', asset: A, version: 1, name: 'x', media: 'video' });
  assert.equal(again.id, vid);
  assert.equal(again.doc, doc);
  const a = addClip(doc, { source: vid, start: 0, length: US });
  const pruned = pruneSources(a.doc);
  assert.deepEqual(pruned.sources.map((s) => s.id), [vid]);
});

test('all 26 templates work as clips: their length is the template\'s, and the clip length sets the showcase', () => {
  assert.equal(motionCatalog.length, 26);
  for (const g of motionCatalog) {
    for (const ratio of ['9:16', '16:9']) {
      const p = motionParams(g, {}, ratio);
      const natural = naturalLength(g, p);
      assert.ok(natural > US, `${g.id} lasts more than a second`);
      const longer = fitToLength(g, p, natural + 3 * US);
      assert.ok(Math.abs(naturalLength(g, longer) - (natural + 3 * US)) <= 2000, `${g.id}: stretched to the clip`);
      if (g.category === 'frames') assert.equal(p.ratio, ratio, `${g.id} takes the project's shape`);
    }
  }
  const g = graphicById('rp-gold');
  const p = motionParams(g, { title: 'يوم الإطلاق', speed: 2, nonsense: 5, glow: 'no' }, '9:16');
  assert.equal(p.title, 'يوم الإطلاق');
  assert.equal(p.speed, 2);
  assert.equal(p.nonsense, undefined, 'unknown parameters are ignored');
  assert.equal(p.glow, g.defaults.glow, 'a parameter of the wrong type is ignored');
  assert.deepEqual(changedParams(g, p), { title: 'يوم الإطلاق', speed: 2 });
  assert.equal(templateTime({ start: US, in: 0 }, 2 * US, p), 2, 'clip time times speed');
  assert.equal(templateTime({ start: US, in: US }, 2 * US, p), 4, 'a split clip continues the template');
  assert.ok(minMotionLength(g, p) < naturalLength(g, p));
  assert.equal(timingOf(g, fitToLength(g, p, 1)).total >= 0, true, 'never a negative showcase');
});

test('Arabic lines break at word boundaries, each paragraph keeps its direction', () => {
  const measure = (s) => [...s].length * 10;
  const lines = wrap('مركز الاتصال المؤسسي يطلق حملة جديدة', 120, measure);
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(l.width <= 120, l.text);
  assert.equal(lines.map((l) => l.text).join(' '), 'مركز الاتصال المؤسسي يطلق حملة جديدة', 'no word lost or cut');
  const mixed = wrap('عنوان\nEnglish title\n', 1000, measure);
  assert.deepEqual(mixed.map((l) => l.dir), ['rtl', 'ltr', 'rtl']);
  assert.equal(paragraphDir('2026 عام'), 'rtl');
  const long = wrap('كلمةطويلةجداجداجدا', 50, measure);
  assert.ok(long.every((l) => l.width <= 50), 'a word wider than the box is cut by letters');
});

test('timed text enters and leaves in 0.4 s', () => {
  const s = defaultText();
  assert.equal(textMotion(s, { start: 0, length: 3 * US }, 0).alpha, 0);
  assert.equal(textMotion(s, { start: 0, length: 3 * US }, US).alpha, 1);
  assert.ok(textMotion(s, { start: 0, length: 3 * US }, 3 * US - 100_000).alpha < 1);
});

test('SRT captions: cues in order, tags removed, broken cues skipped', () => {
  const cues = parseSrt('﻿1\n00:00:01,000 --> 00:00:02,500\n<i>مرحباً</i> بكم\n\n2\n00:00:03,000 --> 00:00:02,000\nخطأ\n\n3\n00:00:04,200 --> 00:00:05,000\nسطر أول\nسطر ثان\n');
  assert.deepEqual(cues, [
    { start: US, end: 2.5 * US, text: 'مرحباً بكم' },
    { start: 4.2 * US, end: 5 * US, text: 'سطر أول\nسطر ثان' },
  ]);
});

test('the device cache: library copies unused for ten days are due, device files and copies in use never', () => {
  const now = 100 * 86_400_000;
  const m = {
    v: 1,
    entries: {
      a: { name: 'a', kind: 'library', bytes: 1, total: 1, complete: true, lastUsed: now - TEN_DAYS - 1 },
      b: { name: 'b', kind: 'library', bytes: 1, total: 1, complete: true, lastUsed: now - TEN_DAYS + 60_000 },
      c: { name: 'c', kind: 'library', bytes: 1, total: 1, complete: true, lastUsed: now - 30 * 86_400_000 },
      d: { name: 'd', kind: 'local', bytes: 1, total: 1, complete: true, lastUsed: 0 },
    },
  };
  assert.deepEqual(dueForSweep(m, now, new Set(['c'])), ['a']);
  assert.deepEqual(nextRange({ bytes: 0, total: 0 }), { from: 0, to: PART - 1 });
  assert.deepEqual(nextRange({ bytes: PART, total: PART + 10 }), { from: PART, to: PART + 9 });
  assert.equal(nextRange({ bytes: 5, total: 5 }), null);
  assert.equal(totalFromRange('bytes 0-99/12345'), 12345);
  assert.equal(totalFromRange(null), null);
  assert.equal(libraryName(A, 3), `asset-${A}-v3`);
});

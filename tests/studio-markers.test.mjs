// The studio, third round, Phase 3 (MVP_draft.md 62.8): markers on the time ruler, YouTube chapters made
// from them and checked against YouTube's rules, and covered areas (their place on the timeline, their
// strength). The pixels of a covered area are checked in the browser (qa/studio-engine.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { addMarker, updateMarker, removeMarker, markersOf, chapters, chapterIssues, youtubeTime, YOUTUBE_CHAPTERS } from '../src/lib/studio/markers.ts';
import { coverBlock, coverRadius, newCover, coverLabel, mosaic, mosaicStep, squareEdges } from '../src/lib/studio/cover.ts';
import { addClip, kindFor, snapPoints, locate } from '../src/lib/studio/timeline.ts';
import { diffDocs } from '../src/lib/studio/diff.ts';

test('markers are added at the playhead, kept in time order, renamed, recoloured and removed', () => {
  let doc = newVideoDoc('16:9', 30);
  const a = addMarker(doc, 20 * US);
  doc = a.doc;
  const b = addMarker(doc, 0, 'المقدمة');
  doc = b.doc;
  assert.deepEqual(markersOf(doc).map((m) => m.label), ['المقدمة', 'علامة 1']);
  assert.equal(addMarker(doc, 20 * US + 300).doc, doc, 'one marker per moment');
  doc = updateMarker(doc, a.id, { label: 'الختام', color: 'red' });
  assert.equal(markersOf(doc)[1].label, 'الختام');
  assert.equal(markersOf(doc)[1].color, 'red');
  assert.equal(updateMarker(doc, a.id, { label: 'x'.repeat(200) }).video.markers.find((m) => m.id === a.id).label.length, 80);
  assert.equal(markersOf(removeMarker(doc, b.id)).length, 1);
  assert.ok(snapPoints(doc, null).includes(20 * US), 'clip edges snap to markers');
  assert.ok(diffDocs(newVideoDoc('16:9', 30), doc).lines.some((l) => l.includes('العلامات')));
});

test('YouTube times are m:ss under an hour and h:mm:ss from an hour, in whole seconds', () => {
  assert.equal(youtubeTime(0), '00:00');
  assert.equal(youtubeTime(65.9 * US), '01:05');
  assert.equal(youtubeTime(3725 * US), '1:02:05');
});

test('chapter lines follow the markers; YouTube\'s rules are checked first (from 00:00, three, ten seconds, names)', () => {
  assert.equal(YOUTUBE_CHAPTERS.minCount, 3);
  assert.equal(YOUTUBE_CHAPTERS.minLength, 10 * US);
  assert.match(YOUTUBE_CHAPTERS.source, /support\.google\.com\/youtube\/answer\/9884579/);
  let doc = newVideoDoc('16:9', 30);
  for (const [t, l] of [[0, 'المقدمة'], [12, 'الإنجازات'], [40, 'الختام']]) doc = addMarker(doc, t * US, l).doc;
  assert.equal(chapters(doc), '00:00 المقدمة\n00:12 الإنجازات\n00:40 الختام');
  assert.deepEqual(chapterIssues(doc, 60 * US), []);
  assert.ok(chapterIssues(doc, 45 * US).some((x) => x.includes('الختام') && x.includes('عشر ثوانٍ')), 'the last chapter runs to the end of the video');
  const two = addMarker(addMarker(newVideoDoc('16:9', 30), 5 * US, 'أ').doc, 30 * US, 'ب').doc;
  const issues = chapterIssues(two, 60 * US);
  assert.ok(issues.some((x) => x.includes('3 علامات')));
  assert.ok(issues.some((x) => x.includes('00:00')));
  const unnamed = updateMarker(doc, markersOf(doc)[1].id, { label: '  ' });
  assert.ok(chapterIssues(unnamed, 60 * US).some((x) => x.includes('بلا اسم')));
});

test('a covered area sits on a graphics track; its strength sets the blur and the squares', () => {
  const doc = newVideoDoc('9:16', 30);
  const c = newCover('blur', 1080, 1920);
  assert.equal(c.shape, 'ellipse');
  assert.equal(newCover('blocks', 1080, 1920).shape, 'rect');
  assert.equal(kindFor(doc, { cover: c }), 'graphics');
  const r = addClip(doc, { start: 0, length: 3 * US, cover: c });
  const track = r.doc.video.tracks.find((t) => t.id === r.trackId);
  assert.equal(track.kind, 'graphics');
  assert.equal(locate(r.doc, r.clipId).clip.cover.mode, 'blur');
  assert.equal(coverRadius({ amount: 1 }) < coverRadius({ amount: 100 }), true);
  assert.equal(coverBlock({ amount: 100 }), 64);
  assert.equal(coverRadius({ amount: 500 }), 50, 'kept within 1 to 100');
  assert.equal(coverLabel({ mode: 'blocks' }), 'إخفاء بالمربعات');
});

// «إخفاء بالمربعات» worked out the same on every machine (2026-11-03; qa/studio-crossdevice.cjs found the old squares
// chip-dependent): each square is the opacity-weighted average of the pixels under it.
const px = (pixels) => new Uint8ClampedArray(pixels.flat());
const colour = (colours, cols, i, j) => [...colours.subarray((j * cols + i) * 4, (j * cols + i) * 4 + 4)];

test('squares: each takes the average colour of the pixels under it, rounded once', () => {
  // 4 x 1: black, white | red, blue
  const data = px([[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 0, 255, 255]]);
  const out = mosaic(data, 4, 1, 2, 1);
  assert.equal(out.length, 2 * 4, 'one colour per square');
  assert.deepEqual(colour(out, 2, 0, 0), [128, 128, 128, 255], '127.5 rounds to 128');
  assert.deepEqual(colour(out, 2, 1, 0), [128, 0, 128, 255]);
});

test('squares: a clear pixel does not tint the square, and the square keeps the average opacity', () => {
  assert.deepEqual(colour(mosaic(px([[255, 0, 0, 255], [0, 255, 0, 0]]), 2, 1, 1, 1), 1, 0, 0), [255, 0, 0, 128]);
  assert.deepEqual(colour(mosaic(px([[9, 9, 9, 0], [7, 7, 7, 0]]), 2, 1, 1, 1), 1, 0, 0), [0, 0, 0, 0], 'nothing under it: clear');
});

test('squares: edges on whole pixels, the same pixels give the same colours, one square per pixel keeps the picture', () => {
  assert.deepEqual([...squareEdges(5, 2)], [0, 2, 5]);
  assert.deepEqual([...squareEdges(1000, 3)], [0, 333, 666, 1000]);
  const w = 5;
  const h = 3;
  const data = new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
  // columns [0, 2) and [2, 5); rows [0, 1) and [1, 3): the first square averages pixels (0,0) and (1,0)
  const out = mosaic(data, w, h, 2, 2);
  const p = (x, y) => [...data.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)];
  assert.deepEqual(colour(out, 2, 0, 0).slice(0, 3), [0, 1, 2].map((c) => Math.round((p(0, 0)[c] + p(1, 0)[c]) / 2)));
  assert.deepEqual([...mosaic(data, w, h, 2, 2)], [...out]);
  assert.deepEqual([...mosaic(data, w, h, w, h)], [...data], 'one square per pixel is the picture itself');
});

test('squares: a large square is averaged on a fixed grid from its corner, the same on every machine', () => {
  assert.equal(mosaicStep(4), 1, 'small squares: every pixel');
  assert.equal(mosaicStep(31), 5);
  // 12 x 1, one square, grid of 4: pixels 0, 4, 8 only
  const data = new Uint8ClampedArray(12 * 4).map((_, i) => (i % 4 === 3 ? 255 : i % 4 === 0 ? ((i >> 2) % 4 === 0 ? 200 : 0) : 0));
  assert.deepEqual(colour(mosaic(data, 12, 1, 1, 1, 4), 1, 0, 0), [200, 0, 0, 255], 'only the grid pixels count');
  assert.deepEqual(colour(mosaic(data, 12, 1, 1, 1, 1), 1, 0, 0), [50, 0, 0, 255], 'every pixel: a quarter of them are red');
});

// The studio, third round, Phase 3 (MVP_draft.md 62.8): markers on the time ruler, YouTube chapters made
// from them and checked against YouTube's rules, and covered areas (their place on the timeline, their
// strength). The pixels of a covered area are checked in the browser (qa/studio-engine.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { addMarker, updateMarker, removeMarker, markersOf, chapters, chapterIssues, youtubeTime, YOUTUBE_CHAPTERS } from '../src/lib/studio/markers.ts';
import { coverBlock, coverRadius, newCover, coverLabel } from '../src/lib/studio/cover.ts';
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

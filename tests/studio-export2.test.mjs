// The studio, third round, Phase 5 (MVP_draft.md 62.10): other shapes of one project (proportional
// places, a clip's own placing in a shape, keyframes kept), the checks for the platforms of an export,
// SRT captions out, and the export record that keeps the shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newVideoDoc, US, RATIOS } from '../src/lib/studio/schema.ts';
import { addClip, addTrack, locate } from '../src/lib/studio/timeline.ts';
import { shapesOf, setShapes, allShapes, docForShape, setReframe, reframeOf, reframeFromPlace, EXTRA_SHAPES_MAX } from '../src/lib/studio/reframe.ts';
import { exportChecks, hasStop } from '../src/lib/studio/checks.ts';
import { toSrt, parseSrt } from '../src/lib/studio/text.ts';
import { transformAt } from '../src/lib/studio/compose.ts';

const text = (content) => ({ content, font: 'Cairo', weight: 700, size: 80, color: '#fff', align: 'center', width: 0.8, lineHeight: 1.3 });

test('other shapes: valid, distinct, not the project\'s own, at most three', () => {
  const doc = newVideoDoc('9:16', 30);
  const d = setShapes(doc, ['1:1', '1:1', '9:16', '16:9', '4:5', '16:9']);
  assert.deepEqual(shapesOf(d), ['1:1', '16:9', '4:5']);
  assert.equal(EXTRA_SHAPES_MAX, 3);
  assert.deepEqual(allShapes(d), ['9:16', '1:1', '16:9', '4:5']);
  assert.equal(setShapes(d, []).video.shapes, undefined);
});

test('in another shape a clip keeps its place in proportion, and its own placing moves it there only', () => {
  let doc = newVideoDoc('9:16', 30);
  const r = addClip(doc, { start: 0, length: 4 * US, text: text('عنوان'), transform: { x: 540, y: 480, scale: 1, rotation: 0, opacity: 1 } });
  doc = setShapes(r.doc, ['1:1']);
  const square = docForShape(doc, '1:1');
  assert.equal(square.video.ratio, '1:1');
  assert.equal(square.video.shapes, undefined);
  const c = locate(square, r.clipId).clip;
  assert.equal(c.transform.x, 540, 'the middle stays the middle');
  assert.equal(c.transform.y, 480 * (1080 / 1920), 'a quarter down stays a quarter down');
  assert.equal(docForShape(doc, '9:16'), doc, 'its own shape is itself');
  // placed again in the square only
  const moved = setReframe(doc, '1:1', r.clipId, reframeFromPlace(doc, '1:1', locate(doc, r.clipId).clip, 0, { x: 300, y: 700, scale: 1.5 }));
  const sq2 = locate(docForShape(moved, '1:1'), r.clipId).clip;
  assert.deepEqual([sq2.transform.x, sq2.transform.y, sq2.transform.scale], [300, 700, 1.5]);
  assert.equal(locate(moved, r.clipId).clip.transform.x, 540, 'the project\'s own shape is unchanged');
  assert.deepEqual(reframeOf(setReframe(moved, '1:1', r.clipId, null), '1:1', r.clipId), { dx: 0, dy: 0, k: 1 });
});

test('keyframes move the same way in every shape, offset by the clip\'s own placing', () => {
  let doc = newVideoDoc('16:9', 30);
  const r = addClip(doc, { start: 0, length: 4 * US, text: text('حركة'), transform: { x: 960, y: 540, scale: 1, rotation: 0, opacity: 1 }, keys: { x: [{ t: 0, v: 480 }, { t: 2 * US, v: 1440 }] } });
  doc = setReframe(setShapes(r.doc, ['9:16']), '9:16', r.clipId, { dx: 100, dy: 0, k: 1 });
  const tall = docForShape(doc, '9:16');
  const c = locate(tall, r.clipId).clip;
  const kx = RATIOS['9:16'].w / RATIOS['16:9'].w;
  assert.equal(transformAt(c, 0, 1080, 1920).x, 480 * kx + 100);
  assert.equal(transformAt(c, 2 * US, 1080, 1920).x, 1440 * kx + 100);
});

test('checks: a picture for a video-only platform stops; a length over a stated limit warns; an unusual shape is a note', () => {
  const yt = { key: 'youtube', label: 'يوتيوب', videoOnly: true };
  const ig = { key: 'instagram', label: 'إنستغرام', videoOnly: false, maxSeconds: 90, suggested: { ratio: 0.8, size: '1080 × 1350' } };
  const still = exportChecks({ kind: 'still', ratios: [1], seconds: 0 }, [yt]);
  assert.ok(hasStop(still) && still[0].text.includes('يوتيوب'));
  const long = exportChecks({ kind: 'video', ratios: [9 / 16], seconds: 120 }, [ig]);
  assert.deepEqual(long.map((c) => c.level), ['warn', 'note']);
  assert.ok(!hasStop(long));
  assert.deepEqual(exportChecks({ kind: 'video', ratios: [9 / 16, 4 / 5], seconds: 30 }, [ig]), [], 'a 4:5 file among the shapes fits');
});

test('SRT out: the texts of a track in order, read back the same by the SRT reader', () => {
  let doc = addTrack(newVideoDoc('9:16', 30), 'text');
  const track = doc.video.tracks.find((t) => t.kind === 'text');
  doc = addClip(doc, { start: 3.25 * US, length: 2 * US, text: text('الثاني') }, { trackId: track.id }).doc;
  doc = addClip(doc, { start: 0.5 * US, length: 1.5 * US, text: text('الأول\nسطر ثانٍ') }, { trackId: track.id }).doc;
  const srt = toSrt(doc, track.id);
  assert.match(srt, /^1\n00:00:00,500 --> 00:00:02,000\nالأول\nسطر ثانٍ\n\n2\n00:00:03,250 --> 00:00:05,250\nالثاني\n$/);
  assert.deepEqual(parseSrt(srt).map((c) => [c.start, c.end, c.text]), [[0.5 * US, 2 * US, 'الأول\nسطر ثانٍ'], [3.25 * US, 5.25 * US, 'الثاني']]);
  assert.equal(toSrt(doc, 'none'), '');
});

test('the export record keeps the shape, checked by the database; older callers still work', () => {
  const sql = readFileSync('supabase/migrations/20261020130000_studio_shapes.sql', 'utf8');
  assert.match(sql, /add column shape text check \(shape is null or shape in \('9:16','16:9','1:1','4:5'\)\)/);
  const fn = sql.match(/create function public\.studio_export_record\([\s\S]*?\n\$\$;/)[0];
  assert.match(fn, /p_shape text default null/);
  const begin = fn.indexOf('begin');
  assert.match(fn.slice(begin, begin + 120), /if not public\.studio_can\(\) then raise exception 'FORBIDDEN'/);
  assert.match(sql, /revoke all on function public\.studio_export_record\(uuid, int, uuid, int, text, text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.studio_export_record\(uuid, int, uuid, int, text, text\) to authenticated;/);
  assert.match(sql, /'shape', e\.shape/);
});

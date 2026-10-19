// The export's rules that need no browser (Studio_Build_Plan.md Phase 4): the sound is mixed in
// contiguous ten-second windows; each clip's gain over time follows its volume, fades and cross-fades;
// muted clips and tracks and pictures are not mixed; the output size keeps the project's shape in even
// pixels; the size estimate grows with length and frame rate; file names keep Arabic. The encoded files
// themselves are checked by ffprobe and ffmpeg in qa/studio-export.cjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { addClip, addSource, setTransition, locate } from '../src/lib/studio/timeline.ts';
import { windows, audibleIn, gainCurve, hasSound, WINDOW, GAIN_STEP } from '../src/lib/studio/audio.ts';
import { outputSize, estimateBytes, fileName } from '../src/lib/studio/export.ts';

const A = '11111111-1111-4111-8111-111111111111';
function project() {
  let d = newVideoDoc('9:16', 30);
  let r = addSource(d, { kind: 'library', asset: A, version: 1, name: 'مقطع', media: 'video', duration: 30 * US });
  d = r.doc;
  const vid = r.id;
  r = addSource(d, { kind: 'library', asset: A, version: 2, name: 'صوت', media: 'audio', duration: 60 * US });
  d = r.doc;
  const snd = r.id;
  r = addSource(d, { kind: 'library', asset: A, version: 3, name: 'صورة', media: 'image' });
  return { doc: r.doc, vid, snd, img: r.id };
}

test('windows are contiguous, ten seconds each, the last one shorter', () => {
  assert.deepEqual(windows(25 * US), [{ from: 0, to: 10 * US }, { from: 10 * US, to: 20 * US }, { from: 20 * US, to: 25 * US }]);
  assert.deepEqual(windows(0), []);
  assert.equal(WINDOW, 10 * US);
});

test('what is mixed in a window: video and sound clips, not pictures, not muted clips or tracks', () => {
  let { doc, vid, snd, img } = project();
  doc = addClip(doc, { source: vid, start: 0, length: 5 * US }).doc;
  doc = addClip(doc, { source: snd, start: 2 * US, length: 20 * US }).doc;
  doc = addClip(doc, { source: img, start: 0, length: 30 * US }).doc;
  const m = addClip(doc, { source: snd, start: 25 * US, length: 5 * US, mute: true });
  doc = m.doc;
  assert.equal(audibleIn(doc, 0, 10 * US).length, 2);
  assert.equal(audibleIn(doc, 10 * US, 20 * US).length, 1, 'the video clip ended at 5 s');
  assert.equal(audibleIn(doc, 24 * US, 30 * US).length, 0, 'the muted clip is not mixed');
  const muted = { ...doc, video: { ...doc.video, tracks: doc.video.tracks.map((t) => (t.kind === 'audio' ? { ...t, muted: true } : t)) } };
  assert.equal(audibleIn(muted, 0, 10 * US).length, 1, 'a muted sound track is not mixed');
  assert.equal(hasSound(doc), true);
});

test('a clip\'s gain over time: its volume, fade in and fade out, zero outside the clip', () => {
  let { doc, snd } = project();
  const r = addClip(doc, { source: snd, start: US, length: 4 * US, volume: 0.5, fadeIn: US, fadeOut: US });
  const { track, clip } = locate(r.doc, r.clipId);
  const curve = gainCurve(track, clip, 0, 6 * US);
  const at = (t) => curve[Math.round(t / GAIN_STEP)];
  assert.equal(at(0.5 * US), 0, 'before the clip');
  assert.ok(Math.abs(at(1.5 * US) - 0.25) < 1e-6, 'half way through the fade in, at half volume');
  assert.ok(Math.abs(at(3 * US) - 0.5) < 1e-6, 'full, at its volume');
  assert.ok(Math.abs(at(4.5 * US) - 0.25) < 1e-6, 'half way through the fade out');
  assert.equal(at(5.5 * US), 0, 'after the clip');
});

test('a cross-fade mixes the two clips at equal power', () => {
  let { doc, snd } = project();
  const a = addClip(doc, { source: snd, start: 0, length: 3 * US });
  const b = addClip(a.doc, { source: snd, start: 3 * US, length: 3 * US, in: 3 * US });
  doc = setTransition(b.doc, b.clipId, US);
  const A1 = locate(doc, a.clipId);
  const B1 = locate(doc, b.clipId);
  const ca = gainCurve(A1.track, A1.clip, 2 * US, 3 * US);
  const cb = gainCurve(B1.track, B1.clip, 2 * US, 3 * US);
  for (let i = 0; i < ca.length - 1; i++) assert.ok(Math.abs(ca[i] ** 2 + cb[i] ** 2 - 1) < 1e-5, `sample ${i}`);
});

test('the output keeps the project\'s shape with its short side at the chosen size, in even pixels', () => {
  assert.deepEqual(outputSize(newVideoDoc('9:16'), 1080), { w: 1080, h: 1920 });
  assert.deepEqual(outputSize(newVideoDoc('9:16'), 720), { w: 720, h: 1280 });
  assert.deepEqual(outputSize(newVideoDoc('16:9'), 2160), { w: 3840, h: 2160 });
  assert.deepEqual(outputSize(newVideoDoc('4:5'), 720), { w: 720, h: 900 });
});

test('the size estimate grows with length, size and frame rate', () => {
  let { doc, vid } = project();
  doc = addClip(doc, { source: vid, start: 0, length: 10 * US }).doc;
  const e1080 = estimateBytes(doc, 1080);
  assert.ok(estimateBytes(doc, 720) < e1080 && e1080 < estimateBytes(doc, 2160));
  assert.ok(estimateBytes({ ...doc, video: { ...doc.video, fps: 60 } }, 1080) > e1080);
  const longer = addClip(doc, { source: vid, start: 10 * US, length: 10 * US }).doc;
  assert.ok(estimateBytes(longer, 1080) > e1080 * 1.9);
});

test('file names keep Arabic and drop what files cannot hold', () => {
  assert.equal(fileName('مقطع: الإطلاق / النهائي?', 'mp4'), 'مقطع الإطلاق النهائي.mp4');
  assert.equal(fileName('   ', 'png'), 'studio.png');
});

// The studio, third round, Phase 4 (MVP_draft.md 62.9): loudness by ITU-R BS.1770-4 (reference tones,
// gating, carrying the filters across windows), the one gain that reaches a target without passing the
// peak ceiling, music lowered under speech with ramps, and waveform peaks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoudnessMeter, normalizeGain, LOUDNESS_TARGET, PEAK_CEILING_DB } from '../src/lib/studio/loudness.ts';
import { reducePeaks, peakIn, peaksKey, PEAKS_PER_SECOND } from '../src/lib/studio/peaks.ts';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { addClip, addSource, addTrack, duckGain, speechAt, roleOf, setTrackSound, DUCK_RAMP, setSpeed, locate } from '../src/lib/studio/timeline.ts';
import { gainCurve, GAIN_STEP } from '../src/lib/studio/audio.ts';

const RATE = 48000;
const sine = (amp, seconds, freq = 997) => {
  const n = Math.round(seconds * RATE);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / RATE);
  return a;
};
const measure = (chunks) => {
  const m = new LoudnessMeter();
  for (const c of chunks) m.push(c);
  return m.result();
};

test('BS.1770 reference: a full-scale 997 Hz tone in one channel reads -3.01 LUFS; at -20 dB on both, -20 LUFS', () => {
  const one = measure([[sine(1, 5), new Float32Array(5 * RATE)]]);
  assert.ok(Math.abs(one.integrated - -3.01) < 0.1, one.integrated);
  const both = measure([[sine(0.1, 5), sine(0.1, 5)]]);
  assert.ok(Math.abs(both.integrated - -20) < 0.1, both.integrated);
  assert.ok(Math.abs(both.peakDb - -20) < 0.05, both.peakDb);
});

test('silence is gated out, and the filters carry across windows (ten one-second windows read as one)', () => {
  const quiet = measure([[sine(0.1, 5), sine(0.1, 5)], [new Float32Array(5 * RATE), new Float32Array(5 * RATE)]]);
  // the blocks that straddle the edge are partly silent but pass both gates, as BS.1770 says they should
  assert.ok(Math.abs(quiet.integrated - -20) < 0.2, quiet.integrated);
  const whole = sine(0.2, 10, 440);
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push([whole.subarray(i * RATE, (i + 1) * RATE), whole.subarray(i * RATE, (i + 1) * RATE)]);
  assert.ok(Math.abs(measure(parts).integrated - measure([[whole, whole]]).integrated) < 1e-6);
  assert.equal(measure([[new Float32Array(RATE)]]).integrated, -Infinity);
});

test('one gain reaches the target, unless the peak would pass the ceiling', () => {
  assert.equal(LOUDNESS_TARGET, -14);
  assert.equal(PEAK_CEILING_DB, -1);
  const g = normalizeGain({ integrated: -20, peakDb: -20, blocks: 40 });
  assert.ok(Math.abs(20 * Math.log10(g) - 6) < 1e-9, 'up 6 dB to -14');
  const capped = normalizeGain({ integrated: -20, peakDb: -3, blocks: 40 });
  assert.ok(Math.abs(20 * Math.log10(capped) - 2) < 1e-9, 'only 2 dB: the peak meets -1 dB');
  assert.equal(normalizeGain({ integrated: -Infinity, peakDb: -Infinity, blocks: 0 }), 1);
});

const A = '11111111-1111-4111-8111-111111111111';
function mix() {
  let d = newVideoDoc('9:16', 30);
  let r = addSource(d, { kind: 'library', asset: A, version: 1, name: 'كلام', media: 'audio', duration: 60 * US });
  d = r.doc;
  const voice = r.id;
  r = addSource(d, { kind: 'library', asset: A, version: 2, name: 'موسيقى', media: 'audio', duration: 60 * US });
  d = r.doc;
  const music = r.id;
  d = addTrack(d, 'audio');
  const [t1, t2] = d.video.tracks.filter((t) => t.kind === 'audio');
  d = addClip(d, { source: music, start: 0, length: 20 * US }, { trackId: t1.id }).doc;
  const v = addClip(d, { source: voice, start: 5 * US, length: 5 * US }, { trackId: t2.id });
  d = setTrackSound(v.doc, t2.id, { role: 'voice' });
  d = setTrackSound(d, t1.id, { duck: 12 });
  return { doc: d, music: t1.id, voice: t2.id, voiceClip: v.clipId };
}

test('music is lowered under speech by its decibels, ramping over a quarter second on each side', () => {
  const { doc, music } = mix();
  const track = doc.video.tracks.find((t) => t.id === music);
  assert.equal(roleOf(track), 'music');
  assert.equal(roleOf({ kind: 'video' }), 'voice', 'video tracks speak unless set');
  assert.equal(duckGain(doc, track, 2 * US), 1, 'no speech yet');
  assert.ok(Math.abs(20 * Math.log10(duckGain(doc, track, 7 * US)) - -12) < 1e-9, '12 dB down under speech');
  assert.equal(speechAt(doc, 5 * US - DUCK_RAMP / 2), 0.5, 'half way down a quarter second before');
  const curve = gainCurve(doc, track, track.clips[0], 0, 20 * US);
  assert.ok(Math.abs(curve[Math.round((7 * US) / GAIN_STEP)] - Math.pow(10, -12 / 20)) < 1e-6, 'the export uses the same lowering (a single-precision curve)');
  assert.equal(setTrackSound(doc, music, { duck: 0 }).video.tracks.find((t) => t.id === music).duck, undefined);
  assert.equal(setTrackSound(doc, music, { duck: 99 }).video.tracks.find((t) => t.id === music).duck, 24);
  // speech that is re-timed is silent, so it lowers nothing
  const { doc: d2, voiceClip, music: music2 } = mix();
  const fast = setSpeed(d2, voiceClip, 2);
  assert.equal(duckGain(fast, fast.video.tracks.find((t) => t.id === music2), 6 * US), 1);
  assert.ok(locate(fast, voiceClip));
});

test('waveform peaks: the loudest sample of each slice, over every channel', () => {
  const left = new Float32Array(RATE).fill(0.1);
  const right = new Float32Array(RATE).fill(-0.6);
  left[RATE / 2] = 0.9;
  const p = reducePeaks([{ timestamp: 0, channels: [left, right], sampleRate: RATE }], 2);
  assert.equal(p.length, 2 * PEAKS_PER_SECOND);
  assert.ok(Math.abs(p[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(p[PEAKS_PER_SECOND / 2] - 0.9) < 1e-6);
  assert.equal(p[PEAKS_PER_SECOND + 5], 0, 'past the sound');
  assert.ok(Math.abs(peakIn(p, 0, 1) - 0.9) < 1e-6);
  assert.equal(peaksKey({ kind: 'library', asset: A, version: 3 }), `asset-${A}-v3`);
});

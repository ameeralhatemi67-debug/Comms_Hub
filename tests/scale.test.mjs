// From a device profile to the studio's speed knobs (src/lib/studio/scale.ts; Desktop_Power_Ideas.md P-34, P-36,
// phase D9): the floor with no profile, a uniformly faster machine never lower, «الأداء» around «تلقائي», and the
// reference documents of the measurement and the proof (bench-docs.ts) valid studio projects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOOR, lanesFrom, LANE_GAIN, MAX_LANES, PERFORMANCE, plan, PREVIEW_STEPS } from '../src/lib/studio/scale.ts';

// The two chips of the pilot laptop, as the probe of 2026-11-03 measured them (Desktop_Power_Ideas.md section 3).
const amd = {
  v: 1, encode: { h264_1080: { hw: 76.4, sw: 55 }, h264_2160: { hw: 20.2, sw: 11.7 } }, decode: { h264_2160: { hw: 187, sw: 102.8 } },
  lanes: [74.3, 115.2, 144.9], compose: { plain: 1.2, text: 3, effects: 7 }, exportFps: 70,
  support: { hevcEncode: false, av1Encode: true, tenBitEncode: false, hevcDecode: true, av1Decode: true }, runs: 3, spread: 5, seconds: 30, renderer: 'AMD',
};
const rtx = { ...amd, encode: { h264_1080: { hw: 87.7, sw: 43 }, h264_2160: { hw: 22.8, sw: 13.5 } }, decode: { h264_2160: { hw: 101.7, sw: 95.7 } }, lanes: [79.7, 184.8, 186.5] };
const weak = { ...amd, encode: { h264_1080: { hw: 35, sw: 18 }, h264_2160: { hw: 8, sw: 3 } }, decode: { h264_2160: { hw: 50, sw: 20 } }, lanes: [35, 38, 39], compose: { plain: 4, text: 11, effects: 20 }, exportFps: 24 };
const scaled = (p, k) => ({
  ...p,
  encode: { h264_1080: { hw: p.encode.h264_1080.hw * k, sw: p.encode.h264_1080.sw * k }, h264_2160: { hw: p.encode.h264_2160.hw * k, sw: p.encode.h264_2160.sw * k } },
  decode: { h264_2160: { hw: p.decode.h264_2160.hw * k, sw: p.decode.h264_2160.sw * k } },
  lanes: p.lanes.map((l) => l * k),
  compose: { plain: p.compose.plain / k, text: p.compose.text / k, effects: p.compose.effects / k },
  exportFps: p.exportFps * k,
});

test('no profile, in a browser or before a measurement: today\'s behaviour, whatever «الأداء» says', () => {
  assert.deepEqual({ ...FLOOR }, { previewStart: 1, frameCacheMB: 0, exportLanes: 1, copiesAtOnce: 1, photoWorkers: 1 });
  for (const perf of PERFORMANCE) assert.deepEqual(plan(null, { cores: 16, memory: 64e9 }, perf), { ...FLOOR });
});

test('lanes: added while the encoders together gain enough, never more than the cap', () => {
  assert.equal(lanesFrom([74.3, 115.2, 144.9]), 2, 'the AMD chip: the third lane gains 26%, less than 30%');
  assert.equal(lanesFrom([79.7, 184.8, 186.5]), 2, 'the RTX: the encoder is full at two');
  assert.equal(lanesFrom([74.3, 115.2, 144.9], 1.05), 3, '«أقصى…» takes the third');
  assert.equal(lanesFrom([50]), 1);
  assert.equal(lanesFrom([10, 100, 1000, 10000, 100000]), MAX_LANES);
  assert.equal(lanesFrom([100, 120, 300]), 1, 'a chain: no third lane without the second');
  assert.equal(LANE_GAIN, 1.3);
});

test('the pilot laptop\'s two chips and a weak laptop', () => {
  const machine = { cores: 12, memory: 16e9 };
  assert.deepEqual(plan(amd, machine), { previewStart: 1, frameCacheMB: 1024, exportLanes: 2, copiesAtOnce: 1, photoWorkers: 10 });
  assert.deepEqual(plan(rtx, machine), { previewStart: 1, frameCacheMB: 1024, exportLanes: 2, copiesAtOnce: 1, photoWorkers: 10 });
  assert.deepEqual(plan(weak, { cores: 4, memory: 8e9 }), { previewStart: 1 / 2, frameCacheMB: 512, exportLanes: 1, copiesAtOnce: 1, photoWorkers: 2 });
});

test('«أخف على الجهاز» is never above «تلقائي», and «أقصى ما يقدر عليه الجهاز» never below', () => {
  for (const p of [amd, rtx, weak]) {
    for (const m of [{ cores: 4, memory: 8e9 }, { cores: 12, memory: 16e9 }, { cores: 32, memory: 128e9 }]) {
      const auto = plan(p, m, 'auto');
      const light = plan(p, m, 'light');
      const max = plan(p, m, 'max');
      for (const k of Object.keys(FLOOR)) {
        assert.ok(light[k] <= auto[k], `light ${k}`);
        assert.ok(max[k] >= auto[k], `max ${k}`);
        assert.ok(light[k] >= (k === 'frameCacheMB' ? 0 : k === 'previewStart' ? PREVIEW_STEPS.at(-1) : 1), `light ${k} has a floor`);
      }
    }
  }
});

test('a machine faster in every figure, with as much memory and as many cores, never gets a lower knob', () => {
  for (const p of [amd, rtx, weak]) {
    for (const perf of PERFORMANCE) {
      for (const k of [1.1, 1.5, 2, 4]) {
        for (const [m, more] of [[{ cores: 4, memory: 8e9 }, { cores: 8, memory: 16e9 }], [{ cores: 12, memory: 16e9 }, { cores: 12, memory: 16e9 }]]) {
          const a = plan(p, m, perf);
          const b = plan(scaled(p, k), more, perf);
          for (const knob of Object.keys(FLOOR)) assert.ok(b[knob] >= a[knob], `${perf} x${k} ${knob}: ${a[knob]} -> ${b[knob]}`);
        }
      }
    }
  }
});

test('the reference documents are studio projects the database would keep, and the corpus draws each at its own times', async () => {
  // bench-docs.ts reaches the motion renderers, which ask for the browser; only their data is used here.
  globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
  const { BENCH_DOCS, corpus, SYNTHETIC_IMAGE, SYNTHETIC_VIDEO } = await import('../src/lib/studio/bench-docs.ts');
  const { checkDoc, durationOf, danglingSources, TRACK_LIMITS } = await import('../src/lib/studio/schema.ts');
  const { TRANSITIONS } = await import('../src/lib/studio/transitions.ts');
  const all = corpus();
  assert.ok(all.length >= 8, 'at least eight documents');
  assert.deepEqual(Object.keys(BENCH_DOCS), ['plain', 'text', 'effects']);
  for (const { name, doc, times } of all) {
    assert.equal(checkDoc(doc), null, name);
    assert.deepEqual(danglingSources(doc), [], name);
    for (const kind of Object.keys(TRACK_LIMITS)) assert.ok(doc.video.tracks.filter((t) => t.kind === kind).length <= TRACK_LIMITS[kind], `${name} ${kind}`);
    assert.ok(times.length >= 3 && times.every((t) => t >= 0 && t < durationOf(doc)), `${name}: its times are inside it`);
    for (const s of doc.sources) assert.ok([SYNTHETIC_VIDEO, SYNTHETIC_IMAGE].includes(s.asset), `${name}: only synthetic sources`);
  }
  // a clip that fits on no track is moved to the end of the timeline (timeline.ts addClip); none may be, or the
  // corpus would not show it at its times (found 2026-11-03: the squares of the covers document were never drawn)
  const { BENCH_LENGTH } = await import('../src/lib/studio/bench-docs.ts');
  for (const { name, doc } of all) {
    if (name === 'transitions') continue;
    for (const c of doc.video.tracks.flatMap((t) => t.clips)) assert.ok(c.start + c.length <= BENCH_LENGTH, `${name}: a clip at ${c.start} was pushed past the document`);
  }
  const covers = all.find((c) => c.name === 'covers');
  const shown = (t) => covers.doc.video.tracks.flatMap((tr) => tr.clips).filter((c) => c.cover && c.start <= t && t < c.start + c.length).map((c) => c.cover.mode);
  assert.ok(covers.times.some((t) => shown(t).includes('blocks')) && covers.times.some((t) => shown(t).includes('blur')), 'the covers document shows both kinds at its times');
  const transitions = all.find((c) => c.name === 'transitions').doc;
  const kinds = transitions.video.tracks.flatMap((t) => t.clips).map((c) => c.transition?.kind).filter(Boolean);
  assert.deepEqual([...kinds].sort(), TRANSITIONS.map((t) => t.kind).sort(), 'every transition once');
});

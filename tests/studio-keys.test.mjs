// The studio, third round, Phase 2 (MVP_draft.md 62.7): keyframes of place, size, turn and opacity. A
// value between two keys follows the first key's curve; before and after them it stays; a cut keeps the
// movement; trimming a clip's start keeps every key where it was in time; the compositor draws a keyed
// clip where its keys say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { valueAt, eased, setKey, removeKey, keyAt, keyTimes, moveKeyTime, removeKeyTime, splitKeys, writeTransform, keyAllMotion, toggleKey, tidyKeys, setEaseAt } from '../src/lib/studio/keys.ts';
import { addClip, locate, splitClip, trimStart } from '../src/lib/studio/timeline.ts';
import { transformAt } from '../src/lib/studio/compose.ts';

const T = { x: 540, y: 960, scale: 1, rotation: 0, opacity: 1 };

test('between two keys the value follows the curve of the first; outside them it stays', () => {
  const ks = [{ t: 0, v: 0 }, { t: 2 * US, v: 100 }];
  assert.equal(valueAt(ks, 1 * US, 7), 50);
  assert.equal(valueAt(ks, -5, 7), 0);
  assert.equal(valueAt(ks, 9 * US, 7), 100);
  assert.equal(valueAt([], 1, 7), 7, 'no keys: the plain value');
  assert.equal(valueAt([{ t: 0, v: 0, ease: 'hold' }, { t: 2 * US, v: 100 }], 1.99 * US, 7), 0);
  for (const e of ['linear', 'in', 'out', 'inOut', 'hold']) {
    assert.equal(eased(e, 0), 0, e);
    assert.equal(eased(e, 1), 1, e);
  }
  assert.ok(eased('in', 0.5) < 0.5 && eased('out', 0.5) > 0.5 && Math.abs(eased('inOut', 0.5) - 0.5) < 1e-9);
});

test('keys are set, replaced within a millisecond, removed and moved', () => {
  let ks = setKey([], 2 * US, 5);
  ks = setKey(ks, 0, 1);
  assert.deepEqual(ks.map((k) => k.t), [0, 2 * US], 'kept in time order');
  ks = setKey(ks, 2 * US + 400, 9, 'out');
  assert.equal(ks.length, 2, 'the same key, replaced');
  assert.equal(keyAt(ks, 2 * US).v, 9);
  assert.equal(keyAt(ks, 2 * US).ease, 'out');
  assert.equal(removeKey(ks, 0).length, 1);
  const keys = { x: ks, scale: [{ t: 2 * US, v: 2 }] };
  assert.deepEqual(keyTimes(keys), [0, 2 * US], 'one time once');
  const moved = moveKeyTime(keys, 2 * US, 3 * US);
  assert.deepEqual(keyTimes(moved), [0, 3 * US]);
  assert.equal(removeKeyTime(moved, 3 * US).scale, undefined, 'an empty list is dropped');
  assert.equal(tidyKeys({ x: [] }), undefined);
  assert.equal(setEaseAt(keys, 0, 'inOut').x[0].ease, 'inOut');
});

test('a change to a keyed setting sets its key at the playhead; another setting changes its plain value', () => {
  const keys = { x: [{ t: 0, v: 100 }, { t: 2 * US, v: 900 }] };
  const r = writeTransform(T, keys, 1 * US, { x: 300, scale: 1.5 });
  assert.deepEqual(r.keys.x.map((k) => [k.t, k.v]), [[0, 100], [1 * US, 300], [2 * US, 900]]);
  assert.equal(r.transform.scale, 1.5);
  assert.equal(r.transform.x, 540, 'the plain x stays: x is keyed');
  const all = keyAllMotion(T, keys, 1 * US);
  assert.equal(Object.keys(all).length, 5, 'P keys every motion setting');
  assert.equal(all.x.find((k) => k.t === 1 * US).v, 500, 'at the value it has there');
  assert.equal(toggleKey(all, 'x', 1 * US, 0).x.length, 2, 'a key there is removed');
  assert.equal(toggleKey(all, 'x', 1.5 * US, 700).x.length, 4, 'else one is added');
});

test('a cut keeps the movement: both sides meet at the cut with the same value', () => {
  const keys = { x: [{ t: 0, v: 0 }, { t: 4 * US, v: 400 }], opacity: [{ t: 3 * US, v: 0.5 }] };
  const [a, b] = splitKeys(keys, 1 * US, { x: 0, opacity: 1 });
  assert.equal(valueAt(a.x, 1 * US, 0), 100);
  assert.equal(valueAt(b.x, 0, 0), 100);
  assert.equal(valueAt(b.x, 3 * US, 0), 400);
  assert.equal(valueAt(a.opacity, 0, 1), 0.5);
  assert.equal(valueAt(b.opacity, 2 * US, 1), 0.5);
});

test('on the timeline: trimming the start and cutting keep the keyed clip where its keys say', () => {
  let doc = newVideoDoc('9:16', 30);
  const r = addClip(doc, { start: 0, length: 4 * US, text: { content: 'عنوان', font: 'Cairo', weight: 700, size: 80, color: '#fff', align: 'center', width: 0.8, lineHeight: 1.3 }, transform: T, keys: { x: [{ t: 0, v: 100 }, { t: 4 * US, v: 500 }] } });
  doc = r.doc;
  const c0 = locate(doc, r.clipId).clip;
  assert.equal(transformAt(c0, 2 * US, 1080, 1920).x, 300);
  assert.equal(transformAt(c0, null, 1080, 1920).x, 540, 'no time: the plain transform');
  const trimmed = locate(trimStart(doc, r.clipId, 1 * US), r.clipId).clip;
  assert.equal(transformAt(trimmed, 2 * US, 1080, 1920).x, 300, 'the same place at the same moment');
  const s = splitClip(doc, r.clipId, 1 * US);
  const second = locate(s.doc, s.secondId).clip;
  assert.equal(transformAt(second, 3 * US, 1080, 1920).x, 400);
});

// The graphics chip's choice (Desktop_Power_Ideas.md P-01, phase D9): the three choices, the switch each one
// asks for, a switch given on the command line kept, and «تلقائي»'s pick from measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_MARGIN, GPU_CHOICES, givenSwitch, gpuChoiceOf, measuredPick, SWITCH_NAMES, switchFor } from '../src/gpu.ts';
import { parseSettings } from '../src/settings.ts';

test('three choices, and nothing else is a choice', () => {
  assert.deepEqual([...GPU_CHOICES], ['auto', 'strong', 'saving']);
  for (const c of GPU_CHOICES) assert.equal(gpuChoiceOf(c), c);
  for (const bad of ['high', 'Auto', '', null, 1, { choice: 'auto' }, 'force_high_performance_gpu']) assert.equal(gpuChoiceOf(bad), null, String(bad));
});

test('the two switches are Chromium\'s own names', () => {
  assert.deepEqual({ ...SWITCH_NAMES }, { high: 'force_high_performance_gpu', low: 'force_low_power_gpu' });
});

test('«الأقوى» and «الموفّرة للطاقة» ask for their switch whatever the power; «تلقائي» takes the pick on mains power only', () => {
  for (const power of ['ac', 'battery', null]) {
    assert.equal(switchFor({ choice: 'strong', pick: null, power }), 'high');
    assert.equal(switchFor({ choice: 'saving', pick: 'high', power }), 'low');
  }
  assert.equal(switchFor({ choice: 'auto', pick: 'high', power: 'ac' }), 'high');
  assert.equal(switchFor({ choice: 'auto', pick: 'low', power: 'ac' }), 'low');
  assert.equal(switchFor({ choice: 'auto', pick: 'high', power: 'battery' }), 'none', 'on battery, Chromium\'s own choice');
  assert.equal(switchFor({ choice: 'auto', pick: 'high', power: null }), 'none', 'power not seen yet');
  assert.equal(switchFor({ choice: 'auto', pick: null, power: 'ac' }), 'none', 'nothing measured');
});

test('a switch already on the command line is read back', () => {
  assert.equal(givenSwitch((n) => n === 'force_high_performance_gpu'), 'high');
  assert.equal(givenSwitch((n) => n === 'force_low_power_gpu'), 'low');
  assert.equal(givenSwitch(() => false), null);
});

const AMD = { vendorId: 0x1002, deviceId: 0x1681 };
const NVIDIA = { vendorId: 0x10de, deviceId: 0x25a2 };
const entry = (sw, chip, fps, { at = 1, power = 'ac', chrome = '152.0.0.0' } = {}) => ({ at, key: { chrome, switch: sw, power, chip }, numbers: { exportFps: fps } });

test('«تلقائي» picks the chip whose reference export was clearly faster, once two chips were measured', () => {
  assert.equal(measuredPick([], '152.0.0.0'), null);
  assert.equal(measuredPick([entry('none', AMD, 70)], '152.0.0.0'), null, 'one chip only');
  assert.equal(measuredPick([entry('none', AMD, 70), entry('low', AMD, 72)], '152.0.0.0'), null, 'the same chip twice');
  assert.equal(measuredPick([entry('low', AMD, 70), entry('high', NVIDIA, 90)], '152.0.0.0'), 'high');
  assert.equal(measuredPick([entry('high', NVIDIA, 60), entry('low', AMD, 90)], '152.0.0.0'), 'low', 'the integrated chip can be the faster');
  assert.equal(measuredPick([entry('none', AMD, 70), entry('high', NVIDIA, 70 * AUTO_MARGIN - 0.1)], '152.0.0.0'), null, 'not clearly faster');
  assert.equal(measuredPick([entry('none', AMD, 90), entry('high', NVIDIA, 70)], '152.0.0.0'), null, 'Chromium\'s own choice was the faster');
});

test('only measurements on mains power, of this Chromium, count; the newest under each switch', () => {
  assert.equal(measuredPick([entry('low', AMD, 70), entry('high', NVIDIA, 90, { power: 'battery' })], '152.0.0.0'), null, 'battery');
  assert.equal(measuredPick([entry('low', AMD, 70), entry('high', NVIDIA, 90, { chrome: '150.0.0.0' })], '152.0.0.0'), null, 'another Chromium');
  assert.equal(measuredPick([entry('low', AMD, 70), entry('high', NVIDIA, 90, { at: 1 }), entry('high', NVIDIA, 60, { at: 2 })], '152.0.0.0'), 'low', 'the newer, slower measurement wins, so the other chip is now the faster');
  assert.equal(measuredPick([entry('low', AMD, 70, { at: 1 }), entry('low', AMD, 88, { at: 3 }), entry('high', NVIDIA, 85, { at: 2 })], '152.0.0.0'), null, 'the newer figure of the same switch replaces the older');
  assert.equal(measuredPick([entry('low', AMD, 70), entry('high', NVIDIA, 0)], '152.0.0.0'), null, 'a zero is not a measurement');
});

test('the settings keep the choice and the last power seen, and default the rest', () => {
  assert.deepEqual(parseSettings(null), { keepInTray: false, gpu: 'auto', lastPower: null });
  assert.deepEqual(parseSettings({ gpu: 'strong', lastPower: 'ac' }), { keepInTray: false, gpu: 'strong', lastPower: 'ac' });
  assert.deepEqual(parseSettings({ gpu: 'turbo', lastPower: 'solar', keepInTray: 1 }), { keepInTray: false, gpu: 'auto', lastPower: null });
});

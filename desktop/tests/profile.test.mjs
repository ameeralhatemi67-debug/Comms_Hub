// The device profile (Desktop_Power_Ideas.md P-33, phase D9): only numbers in their fixed shape are kept, the
// key is the main process's own, one measurement per key, at most MAX_ENTRIES, and clearing removes the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_ENTRIES, profileOf, ProfileStore } from '../src/profile.ts';
import { activeChip } from '../src/device.ts';

const good = () => ({
  v: 1,
  encode: { h264_1080: { hw: 76.4, sw: 55 }, h264_2160: { hw: 20.2, sw: 11.7 } },
  decode: { h264_2160: { hw: 187, sw: 102.8 } },
  lanes: [74.3, 115.2, 144.9],
  compose: { plain: 1.2, text: 3.4, effects: 6.1 },
  exportFps: 70.5,
  support: { hevcEncode: false, av1Encode: true, tenBitEncode: false, hevcDecode: true, av1Decode: true },
  runs: 3,
  spread: 4.2,
  seconds: 28,
  renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)',
});

test('numbers in the fixed shape are kept, rounded, and nothing else', () => {
  const p = profileOf({ ...good(), path: 'C:\\Users\\x', extra: { a: 1 } });
  assert.ok(p);
  assert.equal('path' in p, false);
  assert.equal('extra' in p, false);
  assert.deepEqual(p.lanes, [74.3, 115.2, 144.9]);
  assert.equal(profileOf({ ...good(), exportFps: 70.123456 }).exportFps, 70.12);
  assert.equal(profileOf({ ...good(), encode: { h264_1080: { hw: null, sw: 40 }, h264_2160: { hw: null, sw: 9 } } }).encode.h264_1080.hw, null, 'a coder not offered');
  assert.equal(profileOf({ ...good(), renderer: 'ANGLE\u0000 (x)\n' }).renderer, 'ANGLE (x)', 'only printable text');
});

test('a shape that is not the one is refused whole', () => {
  const bad = [
    null, [], 'x', { ...good(), v: 2 },
    { ...good(), lanes: [] }, { ...good(), lanes: [1, 2, 3, 4, 5] }, { ...good(), lanes: [1, -2] }, { ...good(), lanes: ['1'] },
    { ...good(), exportFps: Infinity }, { ...good(), exportFps: 1e9 }, { ...good(), runs: 0 }, { ...good(), runs: 2.5 }, { ...good(), runs: 9 },
    { ...good(), compose: { plain: 1, text: 1 } }, { ...good(), support: { ...good().support, av1Encode: 'yes' } },
    { ...good(), encode: { h264_1080: { hw: 1 }, h264_2160: { hw: 1, sw: 1 } } }, { ...good(), renderer: 5 },
  ];
  for (const b of bad) assert.equal(profileOf(b), null, JSON.stringify(b)?.slice(0, 80));
});

const key = (over = {}) => ({ app: '0.7.0', chrome: '152.0.7977.130', switch: 'none', power: 'ac', chip: { vendorId: 4098, deviceId: 5761, vendor: 'AMD', name: 'AMD Radeon(TM) Graphics', driver: '31.0.12044.3' }, ...over });

test('the store keeps one measurement per key, the newest, survives a restart, and clears its file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commshub-profile-'));
  const file = path.join(dir, 'profile.json');
  const a = new ProfileStore(file);
  assert.deepEqual(a.entries(), []);
  a.save(key(), profileOf(good()), 1);
  a.save(key(), profileOf({ ...good(), exportFps: 80 }), 2);
  a.save(key({ switch: 'high', chip: { vendorId: 4318, deviceId: 9634, vendor: 'NVIDIA', name: 'NVIDIA GeForce RTX 3050 Laptop GPU', driver: '32.0.16.1091' } }), profileOf(good()), 3);
  assert.equal(a.entries().length, 2, 'the same key replaced');
  assert.equal(a.entries().find((e) => e.key.switch === 'none').numbers.exportFps, 80);
  const b = new ProfileStore(file);
  assert.deepEqual(b.entries(), a.entries(), 'read back after a restart');
  for (let i = 0; i < MAX_ENTRIES + 5; i++) b.save(key({ app: `0.7.${i}` }), profileOf(good()), 10 + i);
  assert.equal(b.entries().length, MAX_ENTRIES, 'bounded');
  assert.equal(b.entries().at(-1).key.app, `0.7.${MAX_ENTRIES + 4}`, 'the newest kept');
  assert.equal(b.clear(), MAX_ENTRIES);
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(new ProfileStore(file).entries(), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a damaged file, or a damaged entry, starts again without the bad parts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commshub-profile-'));
  const file = path.join(dir, 'profile.json');
  fs.writeFileSync(file, '{not json');
  assert.deepEqual(new ProfileStore(file).entries(), []);
  fs.writeFileSync(file, JSON.stringify({ v: 1, entries: [{ at: 1, key: key(), numbers: good() }, { at: 2, key: { ...key(), switch: 'turbo' }, numbers: good() }, { at: 3, key: key(), numbers: { v: 1 } }] }));
  assert.equal(new ProfileStore(file).entries().length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the active chip and its driver come from the GPU information; the software renderer is none', () => {
  const info = { gpuDevice: [
    { active: true, vendorId: 0x1002, deviceId: 0x1681, deviceString: 'AMD Radeon(TM) Graphics', driverVersion: '31.0.12044.3' },
    { active: false, vendorId: 0x10de, deviceId: 0x25a2, deviceString: 'NVIDIA GeForce RTX 3050 Laptop GPU', driverVersion: '32.0.16.1091' },
  ] };
  assert.deepEqual(activeChip(info), { vendorId: 0x1002, deviceId: 0x1681, vendor: 'AMD', name: 'AMD Radeon(TM) Graphics', driver: '31.0.12044.3' });
  assert.equal(activeChip({ gpuDevice: [{ active: true, vendorId: 0x1414, deviceId: 0x8c, deviceString: 'Microsoft Basic Render Driver' }] }), null);
  assert.equal(activeChip(null), null);
  assert.equal(activeChip({ gpuDevice: [{ active: false, vendorId: 0x10de }] }), null);
});

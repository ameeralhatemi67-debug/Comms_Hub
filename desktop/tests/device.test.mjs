// What «معلومات الجهاز» is told (src/device.ts, D2), from the answer Electron gave on the owner's laptop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceInfo, freeBytes, gpuSummary } from '../src/device.ts';
import { parseSettings } from '../src/settings.ts';

// app.getGPUInfo('complete').gpuDevice on the owner's laptop, 2026-10-20 (Electron 44.5.1).
const laptop = {
  gpuDevice: [
    { active: true, deviceId: 9634, deviceString: 'NVIDIA GeForce RTX 3050 Laptop GPU', driverVendor: 'NVIDIA', driverVersion: '32.0.15.9282', vendorId: 4318 },
    { active: false, deviceId: 5761, deviceString: 'AMD Radeon(TM) Graphics', driverVersion: '31.0.12044.3', vendorId: 4098 },
    { active: false, deviceId: 140, deviceString: 'Microsoft Basic Render Driver', driverVersion: '10.0.26100.9711', vendorId: 5140 },
  ],
};

test('two chips, the one in use named, and Windows\' software renderer left out', () => {
  assert.deepEqual(gpuSummary(laptop), {
    chips: [
      { name: 'NVIDIA GeForce RTX 3050 Laptop GPU', vendor: 'NVIDIA', active: true },
      { name: 'AMD Radeon(TM) Graphics', vendor: 'AMD', active: false },
    ],
    active: 'NVIDIA GeForce RTX 3050 Laptop GPU',
    software: false,
  });
});

test('drawing in software is said; a chip without a name is named by its numbers; nonsense is empty', () => {
  const soft = gpuSummary({ gpuDevice: [{ active: true, vendorId: 0x1414, deviceId: 140, deviceString: 'Microsoft Basic Render Driver' }] });
  assert.deepEqual(soft, { chips: [], active: null, software: true });
  assert.equal(gpuSummary({ gpuDevice: [{ active: true, vendorId: 0x8086, deviceId: 0x46a6 }] }).active, 'Intel 0x46a6');
  for (const bad of [null, 'x', {}, { gpuDevice: 'x' }, { gpuDevice: [null, 3] }]) assert.deepEqual(gpuSummary(bad), { chips: [], active: null, software: false });
});

test('free disk from statfs, and the assembled answer', () => {
  assert.equal(freeBytes({ bavail: 10, bsize: 4096 }), 40960);
  assert.equal(freeBytes({ bavail: 10n, bsize: 4096n }), 40960);
  assert.equal(freeBytes(null), null);
  assert.equal(freeBytes({ bsize: 4096 }), null);
  const info = deviceInfo({ version: '0.2.0', bridge: 1, os: 'win32', osVersion: '10.0.26300', arch: 'x64', cpus: Array(12).fill({ model: 'AMD Ryzen 5 6600H with Radeon Graphics         ' }), memory: 16310259712, freeDisk: 5e10, gpu: laptop });
  assert.deepEqual(Object.keys(info), ['version', 'bridge', 'os', 'osVersion', 'arch', 'cores', 'cpu', 'memory', 'freeDisk', 'gpu']);
  assert.equal(info.cores, 12);
  assert.equal(info.cpu, 'AMD Ryzen 5 6600H with Radeon Graphics');
  assert.equal(info.gpu.active, 'NVIDIA GeForce RTX 3050 Laptop GPU');
  assert.equal(JSON.stringify(info).includes('\\'), false, 'no path of any kind');
});

test('settings: «إبقاء التطبيق في شريط المهام» is off unless it was turned on', () => {
  assert.equal(parseSettings(null).keepInTray, false);
  assert.equal(parseSettings({ keepInTray: 'yes' }).keepInTray, false);
  assert.deepEqual(parseSettings({ keepInTray: true, other: 1 }), { keepInTray: true, gpu: 'auto', lastPower: null });
});

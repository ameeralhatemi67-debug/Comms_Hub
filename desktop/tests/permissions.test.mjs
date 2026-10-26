// The permission policy (Desktop_App_Plan.md 5.1, DT-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRANTED, permissionGranted } from '../src/permissions.ts';
import { originsFor } from '../src/origins.ts';

const release = originsFor(false);
const dev = originsFor(true);
const page = 'https://comms-hub-three.vercel.app/motion/studio/p1';
const foreign = 'https://example.com/';

test('the five granted kinds are granted to a page on the list', () => {
  assert.deepEqual([...GRANTED].sort(), ['clipboard-read', 'clipboard-sanitized-write', 'fileSystem', 'fullscreen', 'media', 'notifications']);
  for (const permission of ['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'fileSystem']) {
    assert.equal(permissionGranted({ permission, url: page }, release), true, permission);
    assert.equal(permissionGranted({ permission, url: 'https://comms-hub-three.vercel.app' }, release), true, `${permission} by origin`);
  }
  assert.equal(permissionGranted({ permission: 'notifications', url: 'http://127.0.0.1:3000/' }, dev), true);
});

test('the microphone is granted; the camera never, not even together with the microphone', () => {
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaTypes: ['audio'] }, release), true);
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaTypes: ['video'] }, release), false);
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaTypes: ['audio', 'video'] }, release), false);
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaTypes: [] }, release), false);
  assert.equal(permissionGranted({ permission: 'media', url: page }, release), false);
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaType: 'audio' }, release), true, 'a check for the microphone');
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaType: 'video' }, release), false, 'a check for the camera');
  assert.equal(permissionGranted({ permission: 'media', url: page, mediaType: 'unknown' }, release), false);
});

test('nothing is granted to an address off the list, a frame from elsewhere, or an unknown asker', () => {
  for (const permission of GRANTED) {
    for (const url of [foreign, 'http://127.0.0.1:3000/', 'file:///C:/x.html', null, undefined, '']) {
      assert.equal(permissionGranted({ permission, url, mediaTypes: ['audio'], mediaType: 'audio' }, release), false, `${permission} for ${url}`);
    }
  }
});

test('everything else is refused, even on the list', () => {
  const refused = [
    'geolocation', 'geolocation-approximate', 'midi', 'midiSysex', 'hid', 'serial', 'usb', 'bluetooth', 'display-capture', 'openExternal',
    'pointerLock', 'keyboardLock', 'mediaKeySystem', 'idle-detection', 'window-management', 'local-fonts', 'storage-access',
    'top-level-storage-access', 'screen-wake-lock', 'persistent-storage', 'deprecated-sync-clipboard-read', 'speaker-selection',
    'background-sync', 'sensors', 'nfc', 'ar', 'vr', 'payment-handler', 'local-network-access', 'unknown', '',
  ];
  for (const permission of refused) {
    assert.equal(permissionGranted({ permission, url: page, mediaTypes: ['audio'], mediaType: 'audio' }, release), false, permission);
  }
});

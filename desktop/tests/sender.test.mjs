// The sender check every bridge handler must pass (Desktop_App_Plan.md 5.0 principle 3, section 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, RefusedSender, trustedSender } from '../src/sender.ts';
import { originsFor } from '../src/origins.ts';

const release = originsFor(false);
const windows = new Set([7]);
const mainFrame = (url) => ({ url, parent: null });
const event = (url, id = 7, frame = mainFrame(url)) => ({ sender: { id }, senderFrame: frame });

test('the main frame of an application window on the list is trusted', () => {
  assert.equal(trustedSender(event('https://comms-hub-three.vercel.app/motion/studio/p1'), release, windows), true);
});

test('a frame inside the page, a page off the list, another web contents or a gone frame is refused', () => {
  const page = 'https://comms-hub-three.vercel.app/';
  assert.equal(trustedSender(event(page, 7, { url: page, parent: mainFrame(page) }), release, windows), false, 'a frame, even on the same address');
  assert.equal(trustedSender(event('https://example.com/'), release, windows), false, 'a foreign page');
  assert.equal(trustedSender(event('http://127.0.0.1:3000/'), release, windows), false, 'the local site in a release build');
  assert.equal(trustedSender(event('file:///C:/offline.html'), release, windows), false, 'the connection screen');
  assert.equal(trustedSender(event(page, 99), release, windows), false, 'not one of the application\'s windows');
  assert.equal(trustedSender({ sender: { id: 7 }, senderFrame: null }, release, windows), false, 'the frame is gone');
  assert.equal(trustedSender({ senderFrame: mainFrame(page) }, release, windows), false, 'no sender');
});

test('guard() runs the handler for a trusted sender only, and reads the windows at each call', () => {
  const calls = [];
  let open = new Set([7]);
  const handler = guard(release, () => open, (_event, a, b) => {
    calls.push([a, b]);
    return a + b;
  });
  assert.equal(handler(event('https://comms-hub-three.vercel.app/'), 2, 3), 5);
  assert.throws(() => handler(event('https://example.com/'), 1, 1), RefusedSender);
  open = new Set();
  assert.throws(() => handler(event('https://comms-hub-three.vercel.app/'), 1, 1), RefusedSender, 'the window has closed');
  assert.deepEqual(calls, [[2, 3]]);
});

test('every main-process handler is registered through native.ts\'s guard(), one per callable channel', async () => {
  const fs = await import('node:fs');
  const { CALLABLE, CHANNEL } = await import('../src/ipc.ts');
  const dir = new URL('../src/', import.meta.url);
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'native.ts')) {
    assert.equal(/ipcMain/.test(fs.readFileSync(new URL(name, dir), 'utf8')), false, `${name} uses ipcMain`);
  }
  const source = fs.readFileSync(new URL('native.ts', dir), 'utf8');
  assert.equal((source.match(/ipcMain\.handle\(/g) ?? []).length, 1, 'one registration helper');
  assert.match(source, /ipcMain\.handle\(channel, guard\(o\.allowed, o\.windows, handler\)\)/, 'and it wraps every handler in guard()');
  assert.equal(/ipcMain\.(on|once|addListener|handleOnce)\(/.test(source), false, 'no other way in');
  const files = fs.readFileSync(new URL('native-files.ts', dir), 'utf8');
  const handled = [...`${source}\n${files}`.matchAll(/handle\(CHANNEL\.(\w+)/g)].map((m) => CHANNEL[m[1]]);
  assert.deepEqual([...handled].sort(), [...CALLABLE].sort(), 'each callable channel once');
  assert.equal(handled.includes(CHANNEL.open), false, 'the page cannot call the click channel');
});

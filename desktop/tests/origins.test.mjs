// The compiled address list (Desktop_App_Plan.md 5.1, DT-01).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEVELOPMENT_ORIGIN, isAllowed, originsFor, PRODUCTION_ORIGIN } from '../src/origins.ts';

const release = originsFor(false);
const dev = originsFor(true);

test('a release build holds the production address alone; a development build adds the local site', () => {
  assert.equal(PRODUCTION_ORIGIN, 'https://comms-hub-three.vercel.app');
  assert.equal(DEVELOPMENT_ORIGIN, 'http://127.0.0.1:3000');
  assert.deepEqual([...release], [PRODUCTION_ORIGIN]);
  assert.deepEqual([...dev], [PRODUCTION_ORIGIN, DEVELOPMENT_ORIGIN]);
  assert.ok(Object.isFrozen(release) && Object.isFrozen(dev), 'the lists cannot be changed at run time');
  assert.throws(() => release.push('https://example.com'));
});

test('the production address is allowed with any path, query or fragment, and its default port', () => {
  for (const address of [
    'https://comms-hub-three.vercel.app',
    'https://comms-hub-three.vercel.app/',
    'https://comms-hub-three.vercel.app/motion/studio/abc?v=3#t',
    'https://comms-hub-three.vercel.app:443/works',
    'HTTPS://COMMS-HUB-THREE.VERCEL.APP/login',
  ]) {
    assert.equal(isAllowed(address, release), true, address);
  }
});

test('look-alike, plain, other-port and credential addresses are not on the list', () => {
  for (const address of [
    'http://comms-hub-three.vercel.app/',
    'https://comms-hub-three.vercel.app:8443/',
    'https://comms-hub-three.vercel.app.example.com/',
    'https://evil-comms-hub-three.vercel.app/',
    'https://www.comms-hub-three.vercel.app/',
    'https://vercel.app/',
    'https://user:secret@comms-hub-three.vercel.app/',
    'https://example.com/?next=https://comms-hub-three.vercel.app',
  ]) {
    assert.equal(isAllowed(address, release), false, address);
  }
});

test('the local site is on the development list only, and only at 127.0.0.1:3000', () => {
  assert.equal(isAllowed('http://127.0.0.1:3000/login', dev), true);
  assert.equal(isAllowed('http://127.0.0.1:3000/login', release), false);
  for (const address of ['http://localhost:3000/', 'http://127.0.0.1:3001/', 'https://127.0.0.1:3000/', 'http://127.0.0.1/', 'http://0.0.0.0:3000/']) {
    assert.equal(isAllowed(address, dev), false, address);
  }
});

test('other kinds of address and nonsense are never allowed', () => {
  for (const address of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,x', 'about:blank', 'blob:https://comms-hub-three.vercel.app/1', 'mailto:a@example.com', 'ws://127.0.0.1:3000/', '', 'not a url', '//comms-hub-three.vercel.app']) {
    assert.equal(isAllowed(address, dev), false, address);
  }
});

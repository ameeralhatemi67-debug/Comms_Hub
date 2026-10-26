// Navigation, new windows, redirects and the outside-connection routes (Desktop_App_Plan.md 5.1, DT-01).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECT_NOTE, decideNavigation, isConnectRoute, loadFailure } from '../src/navigation.ts';
import { originsFor } from '../src/origins.ts';

const release = originsFor(false);
const dev = originsFor(true);
const site = 'https://comms-hub-three.vercel.app';

test('pages on the list stay in the application', () => {
  for (const address of [`${site}/`, `${site}/works/CH-101`, `${site}/motion/studio/p1?v=2`, `${site}/api/media/abc/content?v=1`, `${site}/api/drive/status`]) {
    assert.deepEqual(decideNavigation(address, release), { action: 'stay' }, address);
  }
  assert.deepEqual(decideNavigation('http://127.0.0.1:3000/mail', dev), { action: 'stay' });
});

test('other web addresses open in the system browser, with no note', () => {
  for (const address of ['https://developers.facebook.com/apps/', 'http://example.com/a?b=1', 'https://comms-hub-three.vercel.app.example.com/']) {
    assert.deepEqual(decideNavigation(address, release), { action: 'browser', url: new URL(address).href, note: false }, address);
  }
  assert.equal(decideNavigation('http://127.0.0.1:3000/', release).action, 'browser', 'the local site leaves a release build');
});

test('the outside connections open in the system browser after the note', () => {
  for (const path of ['/api/drive/connect', '/api/drive/connect/', '/api/onedrive/connect', '/api/platforms/connect/facebook', '/api/platforms/connect/tiktok', '/api/platforms/connect/youtube?account=1']) {
    const decision = decideNavigation(`${site}${path}`, release);
    assert.deepEqual(decision, { action: 'browser', url: new URL(`${site}${path}`).href, note: true }, path);
  }
  assert.equal(decideNavigation('http://127.0.0.1:3000/api/drive/connect', dev).note, true);
});

test('only the connection routes themselves are connections', () => {
  for (const path of ['/api/drive/callback', '/api/drive/connected', '/api/drive', '/api/platforms/connect', '/api/platforms/connect/', '/api/onedrive/callback', '/settings/connections']) {
    assert.equal(isConnectRoute(path), false, path);
    assert.deepEqual(decideNavigation(`${site}${path}`, release), { action: 'stay' }, path);
  }
  // On another site the same path is just another address.
  assert.deepEqual(decideNavigation('https://example.com/api/drive/connect', release), { action: 'browser', url: 'https://example.com/api/drive/connect', note: false });
});

test('mail links open in the mail program through the system', () => {
  assert.deepEqual(decideNavigation('mailto:team@example.com?subject=x', release), { action: 'browser', url: 'mailto:team@example.com?subject=x', note: false });
});

test('every other kind of address is refused', () => {
  for (const address of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'data:text/html,x', 'blob:https://comms-hub-three.vercel.app/1', 'about:blank', 'chrome://settings', 'devtools://devtools/x', 'ms-settings:privacy', 'ftp://example.com/', 'ws://127.0.0.1:3000/', 'commshub://works/1', 'tel:+966500000000', '', 'nonsense']) {
    assert.deepEqual(decideNavigation(address, dev), { action: 'refuse' }, address);
  }
});

test('the note is the plan\'s sentence, verbatim', () => {
  assert.equal(CONNECT_NOTE, 'يكتمل الربط في المتصفح. سجّل الدخول إلى المركز هناك إن طُلب منك، ثم ارجع إلى التطبيق.');
});

test('a failed load shows the right screen', () => {
  assert.equal(loadFailure(-3), 'ignore', 'a refused navigation or a download');
  for (const code of [-105, -106, -102, -118, -109, -21, -310]) assert.equal(loadFailure(code), 'offline', String(code));
  for (const code of [-200, -201, -202, -207, -213, -299]) assert.equal(loadFailure(code), 'certificate', String(code));
});

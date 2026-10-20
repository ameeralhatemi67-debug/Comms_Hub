// How the application keeps itself up to date (src/update.ts, D3; Desktop_App_Plan.md 7.4, DT-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { CHECK_EVERY_MS, feedAllowed, FIRST_CHECK_MS, nextStatus, PRODUCTION_FEED, restartAction, START } from '../src/update.ts';

const require = createRequire(import.meta.url);

test('the feed is the public bucket of the comms-hub project, the same one the release package names', () => {
  assert.equal(PRODUCTION_FEED, 'https://hrghmioxvgkjpnydrxrk.supabase.co/storage/v1/object/public/desktop-releases/windows-x64');
  const release = require('../electron-builder.release.cjs');
  assert.deepEqual(release.publish, [{ provider: 'generic', url: PRODUCTION_FEED }]);
});

test('it looks at start and every four hours', () => {
  assert.equal(FIRST_CHECK_MS, 10_000);
  assert.equal(CHECK_EVERY_MS, 4 * 3600_000);
});

test('the status follows the updater, and a downloaded update is never forgotten', () => {
  let s = START;
  s = nextStatus(s, { type: 'checking' });
  assert.equal(s.state, 'checking');
  s = nextStatus(s, { type: 'available', version: '0.3.1' });
  assert.deepEqual(s, { state: 'downloading', version: '0.3.1', percent: 0 });
  s = nextStatus(s, { type: 'progress', percent: 41.6 });
  assert.deepEqual(s, { state: 'downloading', version: '0.3.1', percent: 42 });
  assert.equal(nextStatus(s, { type: 'progress', percent: 140 }).percent, 100);
  s = nextStatus(s, { type: 'downloaded', version: '0.3.1' });
  assert.deepEqual(s, { state: 'ready', version: '0.3.1', percent: 100 });
  for (const e of [{ type: 'checking' }, { type: 'none' }, { type: 'error' }, { type: 'available', version: '0.3.2' }]) assert.equal(nextStatus(s, e), s, e.type);
  assert.equal(nextStatus(nextStatus(START, { type: 'checking' }), { type: 'none' }).state, 'none');
  assert.equal(nextStatus(START, { type: 'error' }).state, 'error');
});

test('«إعادة التشغيل للتحديث» only with an update ready, never while a window is busy', () => {
  const ready = { state: 'ready', version: '0.3.1', percent: 100 };
  assert.equal(restartAction(ready, false), 'restart');
  assert.equal(restartAction(ready, true), 'busy');
  assert.equal(restartAction({ state: 'downloading', version: '0.3.1', percent: 50 }, false), 'nothing');
  assert.equal(restartAction(START, false), 'nothing');
});

test('a build carries the production feed; only the update check\'s package may carry one on this laptop', () => {
  assert.equal(feedAllowed(PRODUCTION_FEED, false), true);
  assert.equal(feedAllowed('http://127.0.0.1:4555/feed', false), false, 'never in a release or development build');
  assert.equal(feedAllowed('http://127.0.0.1:4555/feed', true), true);
  for (const bad of ['https://example.com/feed', 'http://localhost:4555/feed', 'http://u:p@127.0.0.1:4555/feed', 'ftp://127.0.0.1/feed', 'not a url']) assert.equal(feedAllowed(bad, true), false, bad);
});

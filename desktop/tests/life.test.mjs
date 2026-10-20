// The window's life while the page works (src/life.ts, D2; decision D-10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { closeAction, quitAction, Registry, shouldNotify } from '../src/life.ts';

test('holds belong to the window that asked, and only it can release them', () => {
  const r = new Registry();
  const a = r.addHold(7, 101, 'export');
  const b = r.addHold(8, 102, 'upload');
  assert.notEqual(a, b);
  assert.equal(r.release(8, a), null, 'another window cannot release it');
  assert.equal(r.release(7, 999), null, 'an unknown hold');
  assert.equal(r.release(7, a), 101, 'the system blocker to stop');
  assert.equal(r.release(7, a), null, 'released once only');
  assert.equal(r.holdCount(), 1);
});

test('a window that closes, crashes or loads another document loses everything it held', () => {
  const r = new Registry();
  r.addHold(7, 101, 'export');
  r.addHold(7, 102, 'export');
  r.addHold(8, 103, 'upload');
  r.setBusy(7, 'export');
  assert.deepEqual(r.releaseAll(7), { blockers: [101, 102], wasBusy: true });
  assert.equal(r.isBusy(7), false);
  assert.equal(r.holdCount(), 1, 'the other window keeps its own');
  assert.deepEqual(r.releaseAll(7), { blockers: [], wasBusy: false });
});

test('busy and idle, with export named first when several windows work', () => {
  const r = new Registry();
  assert.equal(r.busyReason(), null);
  assert.equal(r.setBusy(8, 'upload'), true);
  assert.equal(r.setBusy(8, 'upload'), false, 'no change');
  assert.equal(r.busyReason(), 'upload');
  r.setBusy(7, 'export');
  assert.equal(r.busyReason(), 'export');
  assert.equal(r.busyOf(8), 'upload');
  assert.equal(r.clearBusy(7), true);
  assert.equal(r.clearBusy(7), false);
  assert.equal(r.busyOf(7), null);
  assert.equal(r.busyReason(), 'upload');
});

test('closing: quitting closes; a busy window hides; the main window hides only when kept in the tray', () => {
  const row = (quitting, busy, isMain, keepInTray) => closeAction({ quitting, busy, isMain, keepInTray });
  assert.equal(row(false, false, true, false), 'close', 'D-10: closing quits by default');
  assert.equal(row(false, true, true, false), 'hide', 'during an export');
  assert.equal(row(false, true, false, false), 'hide', 'a second window during an export');
  assert.equal(row(false, false, true, true), 'hide', '«إبقاء التطبيق في شريط المهام»');
  assert.equal(row(false, false, false, true), 'close', 'a second window is not kept');
  assert.equal(row(true, true, true, true), 'close', 'quitting, once confirmed, closes everything');
});

test('quitting while busy asks first; a native notice is for someone not looking', () => {
  assert.equal(quitAction(null, false), 'quit');
  assert.equal(quitAction('export', false), 'ask');
  assert.equal(quitAction('upload', true), 'quit');
  assert.equal(shouldNotify({ focused: true, visible: true, minimized: false }), false);
  assert.equal(shouldNotify({ focused: false, visible: true, minimized: false }), true);
  assert.equal(shouldNotify({ focused: true, visible: false, minimized: false }), true);
  assert.equal(shouldNotify({ focused: true, visible: true, minimized: true }), true);
  assert.equal(shouldNotify(null), true);
});

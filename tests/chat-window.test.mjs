import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SIDE_W,
  MID_W,
  MIN_W,
  atLeast,
  tierOf,
  maxWidth,
  hasMiddle,
  shownWidth,
  sizeName,
  snapWidth,
  keyWidth,
  sizeButtons,
  buttonWidth,
  launcherY,
  backHome,
  boxTrigger,
  dropAddress,
  dropCommand,
  defaultDest,
  sameDest,
  needsGlobalConfirm,
  matches,
  membersAr,
  recipientsAr,
  launcherHidden,
  workOfPath,
} from '../src/lib/chat-window/rules.ts';

test('the window never covers the sidebar, and the full size follows it', () => {
  assert.equal(maxWidth(1440, 224), 1216);
  assert.equal(maxWidth(1440, 76), 1364);
  assert.equal(maxWidth(300, 0), MIN_W);
  assert.equal(shownWidth({ w: 9999, full: false }, 1216), 1216);
  assert.equal(shownWidth({ w: 100, full: false }, 1216), MIN_W);
  assert.equal(shownWidth({ w: 500, full: true }, 1364), 1364);
  assert.equal(shownWidth({ w: Number.NaN, full: false }, 1216), SIDE_W);
});

test('each width shows its tier, and the mail page shows everything', () => {
  assert.equal(tierOf(380), 'side');
  assert.equal(tierOf(599), 'side');
  assert.equal(tierOf(600), 'middle');
  assert.equal(tierOf(999), 'middle');
  assert.equal(tierOf(1000), 'full');
  assert.ok(atLeast('page', 'full'));
  assert.ok(atLeast('full', 'middle'));
  assert.ok(!atLeast('side', 'middle'));
});

test('a drag lands on the stops and becomes the full size near the sidebar', () => {
  assert.deepEqual(snapWidth(390, 1216), { w: SIDE_W, full: false });
  assert.deepEqual(snapWidth(731, 1216), { w: MID_W, full: false });
  assert.deepEqual(snapWidth(540, 1216), { w: 540, full: false });
  assert.deepEqual(snapWidth(1205, 1216), { w: 1216, full: true });
  assert.deepEqual(snapWidth(10, 1216), { w: MIN_W, full: false });
  // No middle stop when the screen has no room for it.
  assert.ok(!hasMiddle(700));
  assert.deepEqual(snapWidth(712, 750), { w: 712, full: false });
});

test('the size buttons follow the brief', () => {
  assert.equal(sizeName(380, 1216), 'side');
  assert.equal(sizeName(720, 1216), 'middle');
  assert.equal(sizeName(1216, 1216), 'full');
  assert.deepEqual(sizeButtons('side', 1216), ['middle', 'full']);
  assert.deepEqual(sizeButtons('side', 700), ['full']);
  assert.deepEqual(sizeButtons('middle', 1216), ['side', 'full']);
  assert.deepEqual(sizeButtons('full', 1216), ['side']);
  assert.deepEqual(buttonWidth('full', 1216), { w: 1216, full: true });
  assert.deepEqual(buttonWidth('middle', 1216), { w: MID_W, full: false });
});

test('the edge moves by keyboard', () => {
  assert.deepEqual(keyWidth('ArrowRight', 380, 1216), { w: 420, full: false });
  assert.deepEqual(keyWidth('ArrowLeft', 380, 1216), { w: 340, full: false });
  assert.deepEqual(keyWidth('End', 380, 1216), { w: 1216, full: true });
  assert.deepEqual(keyWidth('Home', 1216, 1216), { w: SIDE_W, full: false });
  assert.equal(keyWidth('a', 380, 1216), null);
});

test('the launcher moves only up and down the left edge', () => {
  // Default: at the bottom, above a phone's bottom bar when there is one.
  assert.equal(launcherY(null, 900, 72, 0), 16);
  assert.equal(launcherY(null, 812, 94, 62), 78);
  // Never under the top bar, never below the bottom.
  assert.equal(launcherY(5000, 900, 72, 0), 900 - 72 - 56 - 16);
  assert.equal(launcherY(-40, 900, 72, 0), 16);
  assert.ok(backHome(50, 16));
  assert.ok(!backHome(200, 16));
  // There is no horizontal position to keep at all.
  const src = readFileSync(new URL('../src/components/chat-window/launcher.tsx', import.meta.url), 'utf8');
  assert.ok(!/clientX/.test(src), 'the launcher reads only the vertical pointer position');
});

test('@ first picks the destination, @ later mentions, / first is an action', () => {
  assert.deepEqual(boxTrigger('@سا', true), { kind: 'addr', q: 'سا' });
  assert.deepEqual(boxTrigger('@', false), { kind: 'addr', q: '' });
  assert.deepEqual(boxTrigger('/مه', true), { kind: 'cmd', q: 'مه' });
  assert.deepEqual(boxTrigger('شكراً @خا', true), { kind: 'men', q: 'خا' });
  assert.equal(boxTrigger('شكراً @خا', false), null);
  assert.equal(boxTrigger('@سارة مرحباً', true), null);
  assert.equal(boxTrigger('بريد a@b.com', true), null);
  assert.equal(dropAddress('@سارة النص'), 'النص');
  assert.equal(dropCommand('/مهمة'), '');
});

test('where a message goes with nothing chosen', () => {
  assert.deepEqual(defaultDest('chat', null, null, null), { k: 'all' });
  assert.deepEqual(defaultDest('chat', null, null, 'g1'), { k: 'room', id: 'g1' });
  assert.deepEqual(defaultDest('chat', 'r1', 't1', 'g1'), { k: 'room', id: 'r1' });
  assert.deepEqual(defaultDest('mail', 'r1', null, 'g1'), { k: 'mail' });
  assert.deepEqual(defaultDest('mail', null, 't1', null), { k: 'reply', thread: 't1' });
  assert.ok(sameDest({ k: 'room', id: 'a' }, { k: 'room', id: 'a' }));
  assert.ok(!sameDest({ k: 'room', id: 'a' }, { k: 'room', id: 'b' }));
  assert.ok(!sameDest({ k: 'all' }, { k: 'mail' }));
  assert.ok(needsGlobalConfirm(true, false));
  assert.ok(!needsGlobalConfirm(true, true));
  assert.ok(!needsGlobalConfirm(false, false));
});

test('search and Arabic counts', () => {
  assert.ok(matches('سارة', 'سارة القحطاني', 'كاتب المحتوى'));
  assert.ok(matches('ch-241', 'CH-241 · فيلم'));
  assert.ok(!matches('خالد', 'سارة القحطاني'));
  assert.ok(matches('', 'anything'));
  assert.equal(membersAr(1), 'عضو واحد');
  assert.equal(membersAr(2), 'عضوان');
  assert.equal(membersAr(5), '5 أعضاء');
  assert.equal(membersAr(24), '24 عضواً');
  assert.equal(recipientsAr(0), 'أضف المستلمين');
  assert.equal(recipientsAr(4), '4 مستلمين');
});

test('where the launcher stays away, and which work a page is about', () => {
  assert.ok(launcherHidden('/mail'));
  assert.ok(launcherHidden('/mail/chat'));
  assert.ok(launcherHidden('/motion/studio/abc'));
  assert.ok(!launcherHidden('/motion'));
  assert.ok(!launcherHidden('/mailbox'));
  assert.equal(workOfPath('/work/CH-241'), 'CH-241');
  assert.equal(workOfPath('/work/CH-241/review'), 'CH-241');
  assert.equal(workOfPath('/work'), null);
});

test('the window is off unless the account turned it on, and says it is an experiment', () => {
  const sw = readFileSync(new URL('../src/components/chat-window/switch.ts', import.meta.url), 'utf8');
  assert.match(sw, /chat_window/);
  assert.match(sw, /useState\(false\)|on: false/);
  const panel = readFileSync(new URL('../src/components/chat-window/account-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /تجريبي/);
  assert.match(panel, /role="switch"/);
});

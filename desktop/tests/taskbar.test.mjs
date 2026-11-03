// The taskbar button (src/taskbar.ts; D12, Desktop_Power_Ideas.md P-26): the progress the page may show on it, and the
// jump list's fixed places, reached by a word of the list and never by an address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JUMP_ARG, jumpAddress, jumpList, jumpOf, JUMPS, progressBar, progressOf } from '../src/taskbar.ts';

test('the page shows a fraction from 0 to 1, «done» or «failed», and nothing else', () => {
  assert.deepEqual(progressOf(0), { mode: 'normal', value: 0 });
  assert.deepEqual(progressOf(0.4567), { mode: 'normal', value: 0.457 });
  assert.deepEqual(progressOf(1), { mode: 'normal', value: 1 });
  assert.deepEqual(progressOf('done'), { mode: 'none' });
  assert.deepEqual(progressOf('failed'), { mode: 'error' });
  for (const bad of [-0.1, 1.01, NaN, Infinity, '0.5', 'paused', null, undefined, {}, [0.5], true]) assert.equal(progressOf(bad), null, String(bad));
});

test('the bar: as asked, gone when done, and red at the last fraction when the work failed', () => {
  assert.deepEqual(progressBar({ mode: 'normal', value: 0.3 }, 0), { value: 0.3, mode: 'normal' });
  assert.deepEqual(progressBar({ mode: 'none' }, 0.6), { value: -1, mode: 'none' });
  assert.deepEqual(progressBar({ mode: 'error' }, 0.6), { value: 0.6, mode: 'error' });
  assert.deepEqual(progressBar({ mode: 'error' }, 0), { value: 1, mode: 'error' }, 'a failure before any progress still shows');
});

test('the jump list: «الاستوديو» and «يحتاج قرارك», each a task that starts this program with a word of the list', () => {
  const list = jumpList('C:\\Program Files\\CommsHub\\CommsHub.exe');
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'tasks');
  assert.deepEqual(list[0].items.map((i) => i.title), ['الاستوديو', 'يحتاج قرارك']);
  for (const i of list[0].items) {
    assert.equal(i.program, 'C:\\Program Files\\CommsHub\\CommsHub.exe');
    assert.match(i.args, /^--commshub-go=(studio|decisions)$/);
    assert.equal(/https?:|\/\//.test(i.args), false, 'never an address');
  }
  assert.deepEqual(Object.values(JUMPS).map((j) => j.path), ['/motion/studio', '/']);
});

test('a start from the jump list names a place of the list; any other argument reaches nothing', () => {
  assert.equal(jumpOf(['CommsHub.exe', `${JUMP_ARG}studio`]), 'studio');
  assert.equal(jumpOf(['CommsHub.exe', `${JUMP_ARG}studio`, `${JUMP_ARG}decisions`]), 'decisions', 'the last one');
  for (const bad of [[], ['CommsHub.exe'], [`${JUMP_ARG}https://evil.example/`], [`${JUMP_ARG}/settings`], [`${JUMP_ARG}constructor`], [`${JUMP_ARG}__proto__`], [`${JUMP_ARG}`], ['--commshub-go', 'studio']]) assert.equal(jumpOf(bad), null, JSON.stringify(bad));
  assert.equal(jumpAddress('https://comms-hub-three.vercel.app', 'studio'), 'https://comms-hub-three.vercel.app/motion/studio');
});

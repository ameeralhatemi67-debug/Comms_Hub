// The application's keys (Desktop_App_Plan.md 11.1, "Menu"), held apart from every key the site uses:
// the studio's shortcuts and the review screen's keys are read from the site itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyAction, nextZoom, ZOOM_STEPS } from '../src/keys.ts';
import { SHORTCUTS } from '../../src/lib/studio/shortcuts.ts';
import { REVIEW_KEYS } from '../../src/lib/work/review-keys.ts';

const key = (code, mods = {}, type = 'keyDown') => ({ type, code, key: '', control: false, shift: false, alt: false, meta: false, ...mods });

test('zoom with Ctrl and plus, minus or zero, on either keyboard part', () => {
  assert.equal(keyAction(key('Equal', { control: true }), false), 'zoom-in');
  assert.equal(keyAction(key('Equal', { control: true, shift: true }), false), 'zoom-in', 'Ctrl and + on the main keys');
  assert.equal(keyAction(key('NumpadAdd', { control: true }), false), 'zoom-in');
  assert.equal(keyAction(key('Minus', { control: true }), false), 'zoom-out');
  assert.equal(keyAction(key('NumpadSubtract', { control: true }), false), 'zoom-out');
  assert.equal(keyAction(key('Digit0', { control: true }), false), 'zoom-reset');
  assert.equal(keyAction(key('Numpad0', { control: true }), false), 'zoom-reset');
});

test('full screen with F11, reload with F5, without the cache with Ctrl or Shift', () => {
  assert.equal(keyAction(key('F11'), false), 'full-screen');
  assert.equal(keyAction(key('F5'), false), 'reload');
  assert.equal(keyAction(key('F5', { control: true }), false), 'reload-fresh');
  assert.equal(keyAction(key('F5', { shift: true }), false), 'reload-fresh');
});

test('the developer tools open with F12 in a development build only', () => {
  assert.equal(keyAction(key('F12'), true), 'devtools');
  assert.equal(keyAction(key('F12'), false), null);
});

test('a key without its position is read from the key itself', () => {
  assert.equal(keyAction({ ...key(''), key: '=', control: true }, false), 'zoom-in');
  assert.equal(keyAction({ ...key(''), key: 'F11' }, false), 'full-screen');
  assert.equal(keyAction({ ...key(''), key: 'z', control: true }, false), null);
});

test('only a key going down acts; Alt, AltGr and the Windows key leave everything to the page', () => {
  assert.equal(keyAction(key('F11', {}, 'keyUp'), false), null);
  assert.equal(keyAction(key('F11', {}, 'rawKeyDown'), false), 'full-screen');
  assert.equal(keyAction(key('Equal', { control: true, alt: true }), false), null, 'AltGr is Ctrl and Alt');
  assert.equal(keyAction(key('F5', { alt: true }), false), null);
  assert.equal(keyAction(key('Equal', { control: true, meta: true }), false), null);
});

test('Ctrl+Z and the editing keys are the page\'s', () => {
  for (const [code, mods] of [['KeyZ', { control: true }], ['KeyZ', { control: true, shift: true }], ['KeyY', { control: true }], ['KeyC', { control: true }], ['KeyV', { control: true }], ['KeyR', { control: true }], ['Equal', {}], ['Minus', {}], ['Digit0', {}], ['Escape', {}], ['F1', {}], ['F2', {}]]) {
    assert.equal(keyAction(key(code, mods), true), null, `${code} ${JSON.stringify(mods)}`);
  }
});

// The site writes a key as 'Ctrl+Alt+Shift+Code' (src/lib/studio/shortcuts.ts comboOf).
const fromCombo = (combo) => {
  const parts = combo.split('+');
  const code = parts.pop();
  return key(code, { control: parts.includes('Ctrl'), alt: parts.includes('Alt'), shift: parts.includes('Shift') });
};

test('no key of the studio or of the review screen is taken by the application', () => {
  const combos = [...SHORTCUTS.flatMap((s) => s.combos), ...REVIEW_KEYS.flatMap((k) => k.combos)];
  assert.ok(combos.length > 60, `read ${combos.length} keys from the site`);
  for (const combo of combos) {
    assert.equal(keyAction(fromCombo(combo), true), null, combo);
  }
});

test('zoom follows Chromium\'s steps and stops at 25% and 500%', () => {
  assert.equal(nextZoom(1, 1), 1.1);
  assert.equal(nextZoom(1, -1), 0.9);
  assert.equal(nextZoom(1.1, -1), 1);
  assert.equal(nextZoom(1.05, 1), 1.1, 'between steps, the next one up');
  assert.equal(nextZoom(5, 1), 5);
  assert.equal(nextZoom(0.25, -1), 0.25);
  assert.equal(ZOOM_STEPS[0], 0.25);
  assert.equal(ZOOM_STEPS.at(-1), 5);
});

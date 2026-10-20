// The window's remembered place (Desktop_App_Plan.md 5.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SIZE, MIN_SIZE, parseState, placeWindow } from '../src/window-state.ts';

const laptop = { x: 0, y: 0, width: 1920, height: 1032 };
const second = { x: 1920, y: 0, width: 2560, height: 1400 };
const left = { x: -1920, y: 0, width: 1920, height: 1040 };

test('a saved state is read back only when it is whole', () => {
  assert.deepEqual(parseState({ bounds: { x: 10.4, y: 20, width: 1200, height: 800 }, maximized: true }), { bounds: { x: 10, y: 20, width: 1200, height: 800 }, maximized: true });
  assert.equal(parseState({ bounds: { x: 10, y: 20, width: 1200 }, maximized: false }), null);
  assert.equal(parseState({ bounds: { x: 'a', y: 0, width: 1, height: 1 } }), null);
  assert.equal(parseState({ bounds: { x: 0, y: 0, width: 0, height: 600 } }), null);
  assert.equal(parseState({ bounds: { x: 0, y: 0, width: Infinity, height: 600 } }), null);
  assert.equal(parseState(null), null);
  assert.equal(parseState('x'), null);
  assert.equal(parseState({ bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: 'yes' }).maximized, false);
});

test('the first launch opens at the default size, centred, and never larger than the screen', () => {
  assert.deepEqual(placeWindow(null, [laptop], laptop), { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, maximized: false });
  const small = { x: 0, y: 0, width: 1280, height: 680 };
  assert.deepEqual(placeWindow(null, [small], small), { width: 1280, height: 680, maximized: false });
});

test('the last place, size and screen come back, maximised or not', () => {
  const saved = { bounds: { x: 2100, y: 80, width: 1600, height: 1000 }, maximized: true };
  assert.deepEqual(placeWindow(saved, [laptop, second], laptop), { x: 2100, y: 80, width: 1600, height: 1000, maximized: true });
  const onLeft = { bounds: { x: -1800, y: 40, width: 1200, height: 800 }, maximized: false };
  assert.deepEqual(placeWindow(onLeft, [laptop, left], laptop), { x: -1800, y: 40, width: 1200, height: 800, maximized: false });
});

test('a place no screen shows any more falls back to the default, keeping the maximised state', () => {
  const saved = { bounds: { x: 2100, y: 80, width: 1600, height: 1000 }, maximized: true };
  assert.deepEqual(placeWindow(saved, [laptop], laptop), { width: DEFAULT_SIZE.width, height: DEFAULT_SIZE.height, maximized: true });
  const above = { bounds: { x: 100, y: -900, width: 1200, height: 800 }, maximized: false };
  assert.equal(placeWindow(above, [laptop], laptop).x, undefined, 'its top strip is off every screen');
});

test('a window bigger than its screen is fitted to it, and never below the smallest size', () => {
  const saved = { bounds: { x: 0, y: 0, width: 3000, height: 2000 }, maximized: false };
  assert.deepEqual(placeWindow(saved, [laptop], laptop), { x: 0, y: 0, width: 1920, height: 1032, maximized: false });
  const tiny = { bounds: { x: 10, y: 10, width: 200, height: 100 }, maximized: false };
  const placed = placeWindow(tiny, [laptop], laptop);
  assert.equal(placed.width, MIN_SIZE.width);
  assert.equal(placed.height, MIN_SIZE.height);
});

test('a window whose top strip is only partly on a screen keeps its place if it can still be grabbed', () => {
  const edge = { bounds: { x: 1700, y: 100, width: 1200, height: 800 }, maximized: false };
  assert.equal(placeWindow(edge, [laptop], laptop).x, 1700, '220 pixels of its top strip are on the laptop');
  const sliver = { bounds: { x: 1880, y: 100, width: 1200, height: 800 }, maximized: false };
  assert.equal(placeWindow(sliver, [laptop], laptop).x, undefined, 'only 40 pixels show');
});

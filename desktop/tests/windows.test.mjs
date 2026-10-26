// The studio's windows on more than one screen (src/windows.ts, D6): the one address a panel's window may
// open, the screens as the page is told them, which screen a window goes to, and where on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { centreOn, PANELS, panelAddress, pickScreen, screensOf } from '../src/windows.ts';

const project = '0a1b2c3d-0000-4000-8000-00000000abcd';
const site = 'https://comms-hub-three.vercel.app';

test('a panel\'s window opens the project\'s own address on the page\'s origin, and nothing else', () => {
  assert.deepEqual([...PANELS], ['preview']);
  assert.equal(panelAddress(site, 'preview', project), `${site}/motion/studio/${project}/preview`);
  assert.equal(panelAddress('http://127.0.0.1:3000', 'preview', project), `http://127.0.0.1:3000/motion/studio/${project}/preview`);
  for (const [panel, id] of [['timeline', project], ['preview', 'not-a-uuid'], ['preview', `${project}/../../x`], ['preview', project.toUpperCase()], [undefined, project], ['preview', 42]]) {
    assert.equal(panelAddress(site, panel, id), null, `${panel} ${id}`);
  }
  assert.equal(panelAddress(`${site}/motion`, 'preview', project), null, 'an origin, never a page');
  assert.equal(panelAddress('not an origin', 'preview', project), null);
});

const displays = [
  { id: 1, label: 'Built-in display', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, scaleFactor: 1.25 },
  { id: 2, label: 'DELL U2720Q', bounds: { x: 1920, y: 0, width: 3840, height: 2160 }, workArea: { x: 1920, y: 0, width: 3840, height: 2120 }, scaleFactor: 1.5 },
];

test('the screens: the system\'s own description, which is the main one and which holds the asking window', () => {
  const s = screensOf(displays, 1, 1);
  assert.deepEqual(s.map((x) => [x.id, x.primary, x.current]), [[1, true, true], [2, false, false]]);
  assert.deepEqual(Object.keys(s[0]), ['id', 'label', 'primary', 'current', 'bounds', 'workArea', 'scaleFactor']);
  assert.equal(screensOf([{ ...displays[0], label: 'x'.repeat(200) }], 1, null)[0].label.length, 80);
});

test('a window goes to the screen asked for, else to another than the asking window\'s, else to that one', () => {
  const s = screensOf(displays, 1, 1);
  assert.equal(pickScreen(s, 1).id, 1, 'asked');
  assert.equal(pickScreen(s, 99).id, 2, 'an unknown screen: another one');
  assert.equal(pickScreen(s, undefined).id, 2, 'not asked: the second screen');
  assert.equal(pickScreen(screensOf([displays[0]], 1, 1), undefined).id, 1, 'one screen only');
  assert.equal(pickScreen([], 1), null);
});

test('a window sits in the middle of the screen\'s work area, never larger than it', () => {
  const [one, two] = screensOf(displays, 1, 1);
  assert.deepEqual(centreOn(two), { x: 1920 + 1280, y: 700, width: 1280, height: 720 });
  assert.deepEqual(centreOn(one, { width: 4000, height: 3000 }), { x: 0, y: 0, width: 1920, height: 1040 });
});

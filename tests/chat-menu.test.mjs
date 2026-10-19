import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(f, 'utf8');

test('the conversation pane does not turn its menus into in-flow blocks', () => {
  const css = read('src/app/chat.css');
  // The menus (message, room, attach, picker) are drawn as direct children of .cx-main; a plain
  // `.cx-main>*{position:relative}` would beat `.mx-menu{position:fixed}` and push the composer up.
  const rule = css.split('\n').find((l) => l.startsWith('.cx-main>*'));
  assert.ok(rule, 'the child rule exists');
  assert.match(rule, /:not\(\.mx-menu\)/);
  assert.match(read('src/app/media.css'), /\.mx-menu\{position:fixed;z-index:60/);
});

test('the menu keeps itself inside the screen by its measured height', () => {
  const tsx = read('src/components/chat/chat-tab.tsx');
  const pop = tsx.slice(tsx.indexOf('function Pop('), tsx.indexOf('function NewChat('));
  assert.match(pop, /useLayoutEffect/);
  assert.match(pop, /offsetHeight/);
  assert.match(pop, /maxHeight: h - 16/);
  assert.match(pop, /overflowY: 'auto'/);
  assert.doesNotMatch(pop, /h - 380/, 'the old guess of 380 px is gone');
});

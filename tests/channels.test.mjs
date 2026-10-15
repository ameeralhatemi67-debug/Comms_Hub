// Action_Plan.md B8: what is left of the prototype's first model, and the small shell state that
// replaced its reducer. The sample works, notices and directory are gone; the rules they stood for
// are in the database and tested by the rule runs in supabase/tests/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { roles, roleIds, statusLabels, channelRisks, riskText } from '../src/lib/domain.ts';
import { initialState, reducer } from '../src/lib/ui-state.ts';

test('the role table keeps the separation of authority: the administrator neither approves nor publishes', () => {
  assert.equal(roleIds.length, 8);
  assert.deepEqual(
    [roles.admin.create, roles.admin.review, roles.admin.publish, roles.admin.admin],
    [false, false, false, true],
  );
  assert.deepEqual(roleIds.filter((r) => roles[r].review).sort(), ['assistant', 'director']);
  assert.deepEqual(roleIds.filter((r) => roles[r].publish), ['publisher']);
});

test('the eleven statuses have their Arabic words', () => {
  assert.equal(Object.keys(statusLabels).length, 11);
  assert.equal(statusLabels.IN_REVIEW, 'قيد المراجعة');
  assert.equal(statusLabels.FAILED, 'فشل النشر');
});

test('the channel list the library dialogs still offer warns when an authorisation will not cover the time', () => {
  const evening = channelRisks(['Instagram', 'X', 'LinkedIn'], '2026-09-23T18:00');
  assert.deepEqual(evening.map((r) => [r.channel, r.expired]), [['X', false], ['LinkedIn', true]]);
  assert.deepEqual(channelRisks(['Instagram', 'X'], '2026-09-23T09:00'), []);
  assert(riskText(evening[0]).includes('قبل موعد النشر'));
  assert(riskText(evening[1]).includes('منتهٍ'));
});

test('a locked session cannot switch role, and reset returns to its own role', () => {
  let s = initialState('writer', true);
  s = reducer(s, { type: 'role', role: 'director' });
  assert.equal(s.role, 'writer');
  assert.match(s.message, /مسؤول النظام/);
  s = reducer(s, { type: 'notify', text: 'x' });
  assert.equal(s.message, 'x');
  s = reducer(s, { type: 'clear' });
  assert.equal(s.message, '');
  assert.equal(reducer(s, { type: 'reset' }).role, 'writer');
});

test('the prototype\'s sample model is gone from the code the product runs', () => {
  const domain = readFileSync('src/lib/domain.ts', 'utf8');
  const code = domain.replace(/^\s*\/\/.*$/gm, ''); // names in comments are history, not code
  for (const gone of ['initialState', 'reducer', 'seedRows', 'homeTiles', 'campaign', 'directory', 'noticesFor', 'teamLoad'])
    assert.doesNotMatch(code, new RegExp(`\\b${gone}\\b`), gone);
  assert.ok(domain.split('\n').length < 260, 'a short file');
  assert.equal(existsSync('src/components/gallery.tsx'), false);
  assert.equal(existsSync('tests/domain.test.mjs'), false);
  // Messaging and the global search read real works.
  assert.doesNotMatch(readFileSync('src/components/chat/chat-tab.tsx', 'utf8'), /state\.work|from '@\/lib\/domain'/);
  const shell = readFileSync('src/components/shell.tsx', 'utf8');
  assert.doesNotMatch(shell, /state\.work/);
  assert.match(shell, /from\('works'\)\.select\('id,title,status'\)/);
});

test('the page header says the real day, not a model date', () => {
  const ui = readFileSync('src/components/ui.tsx', 'utf8');
  assert.doesNotMatch(ui, /scenario\./);
  assert.match(ui, /timeZone: 'Asia\/Riyadh'/);
});

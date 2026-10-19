// The studio's window layout (src/lib/studio/workspace.ts, MVP_draft.md 62.1): windows merge into tabs,
// split beside each other, float, resize, close and open again; a stored layout is checked before use;
// the layout is always normalised. The presets of both editors are valid and hold every window once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  group, row, col, layoutOf, movePanel, removePanel, openPanel, togglePanel, activate, panelsOf, whereIs, groupsOf, resizeSplit, evenSplit,
  floatPanel, dockFloat, raiseFloat, placeFloat, clampFloats, toggleMax, visiblePanels, repair, ensurePanels, normalize, closeGroup, MIN_FRACTION,
} from '../src/lib/studio/workspace.ts';
import { PRESETS, PANEL_HOMES, panelIds } from '../src/lib/studio/panels.ts';

const base = () => layoutOf(col([0.6, row([0.25, group(['inspector', 'project'])], [0.5, group(['program'])], [0.25, group(['media', 'templates'])])], [0.4, group(['timeline'])]));
const once = (l) => {
  const p = panelsOf(l);
  assert.equal(new Set(p).size, p.length, 'every window at most once');
};
const sumOk = (n) => {
  if (n.type === 'group') return;
  assert.ok(Math.abs(n.sizes.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'shares sum to one');
  assert.equal(n.sizes.length, n.children.length);
  for (const c of n.children) {
    assert.ok(!(c.type === 'split' && c.dir === n.dir), 'no split inside a split of its direction');
    sumOk(c);
  }
};

test('merging a window into another group\'s tabs moves it and shows it there', () => {
  const l = base();
  const target = whereIs(l, 'program').group.id;
  const m = movePanel(l, 'templates', { kind: 'group', group: target, zone: 'center' });
  const g = whereIs(m, 'templates').group;
  assert.equal(g.id, target);
  assert.deepEqual(g.tabs, ['program', 'templates']);
  assert.equal(g.active, 'templates');
  assert.deepEqual(whereIs(m, 'media').group.tabs, ['media']);
  once(m);
  sumOk(m.root);
});

test('a tab can be put at a place among the tabs, and reordered inside its own group', () => {
  const l = base();
  const g = whereIs(l, 'inspector').group.id;
  const m = movePanel(l, 'media', { kind: 'group', group: g, zone: 'center', index: 0 });
  assert.deepEqual(whereIs(m, 'media').group.tabs, ['media', 'inspector', 'project']);
  const r = movePanel(m, 'project', { kind: 'group', group: g, zone: 'center', index: 0 });
  assert.deepEqual(whereIs(r, 'project').group.tabs, ['project', 'media', 'inspector']);
});

test('dropping on an edge splits beside the group, in the parent row when the direction matches', () => {
  const l = base();
  const prog = whereIs(l, 'program').group.id;
  const m = movePanel(l, 'project', { kind: 'group', group: prog, zone: 'right' });
  // the top row now has four children: the new group right after the program window
  const top = m.root.children[0];
  assert.equal(top.dir, 'row');
  assert.equal(top.children.length, 4);
  assert.deepEqual(top.children[2].tabs, ['project']);
  sumOk(m.root);
  // a different direction wraps the group in a new split
  const v = movePanel(l, 'project', { kind: 'group', group: prog, zone: 'bottom' });
  const mid = v.root.children[0].children[1];
  assert.equal(mid.type, 'split');
  assert.equal(mid.dir, 'col');
  assert.deepEqual(mid.children.map((c) => c.tabs), [['program'], ['project']]);
  once(v);
});

test('splitting a group by its only window changes nothing; moving the last window of a group removes the group', () => {
  const l = base();
  const prog = whereIs(l, 'program').group.id;
  assert.equal(movePanel(l, 'program', { kind: 'group', group: prog, zone: 'left' }), l);
  const tl = whereIs(l, 'timeline').group.id;
  const m = movePanel(l, 'program', { kind: 'group', group: tl, zone: 'center' });
  assert.equal(groupsOf(m).length, groupsOf(l).length - 1);
  // the top row lost its middle child and its shares still sum to one
  assert.equal(m.root.children[0].children.length, 2);
  sumOk(m.root);
});

test('docking along an edge of the whole workspace', () => {
  const m = movePanel(base(), 'media', { kind: 'root', zone: 'left' });
  assert.equal(m.root.dir, 'row');
  assert.deepEqual(m.root.children[0].tabs, ['media']);
  assert.ok(m.root.sizes[0] < 0.5);
  sumOk(m.root);
  once(m);
});

test('closing and opening: a closed window returns beside the windows it belongs with', () => {
  const l = removePanel(base(), 'templates');
  assert.ok(!panelsOf(l).includes('templates'));
  const o = openPanel(l, 'templates', ['media']);
  assert.deepEqual(whereIs(o, 'templates').group.tabs, ['media', 'templates']);
  // with none of its neighbours open, it docks along the edge
  const bare = removePanel(removePanel(l, 'media'), 'templates');
  const e = openPanel(bare, 'templates', ['media'], 'right');
  assert.equal(e.root.dir, 'row');
  assert.deepEqual(e.root.children[e.root.children.length - 1].tabs, ['templates']);
  // toggling twice comes back to a layout with the window
  assert.ok(panelsOf(togglePanel(togglePanel(base(), 'project'), 'project', ['inspector'])).includes('project'));
  // opening an open window shows its tab
  assert.equal(whereIs(openPanel(base(), 'project'), 'project').group.active, 'project');
  // closing everything leaves an empty workspace that opening fills again
  let empty = base();
  for (const p of panelsOf(empty)) empty = removePanel(empty, p);
  assert.equal(empty.root, null);
  assert.deepEqual(openPanel(empty, 'program').root.tabs, ['program']);
});

test('closing the active tab shows its neighbour; closing a group removes all its windows', () => {
  let l = activate(base(), 'project');
  l = removePanel(l, 'project');
  assert.equal(whereIs(l, 'inspector').group.active, 'inspector');
  const b = base();
  const c = closeGroup(b, whereIs(b, 'media').group.id);
  assert.ok(!panelsOf(c).includes('media') && !panelsOf(c).includes('templates'));
});

test('resizing a border keeps both sides above the minimum and their total unchanged', () => {
  const l = base();
  const top = l.root.children[0];
  const r = resizeSplit(l, top.id, 0, 0.9);
  const s = r.root.children[0].sizes;
  assert.ok(Math.abs(s[0] + s[1] - (top.sizes[0] + top.sizes[1])) < 1e-9);
  assert.ok(s[1] >= MIN_FRACTION - 1e-9);
  const e = evenSplit(r, top.id, 0);
  assert.ok(Math.abs(e.root.children[0].sizes[0] - e.root.children[0].sizes[1]) < 1e-9);
});

test('floating windows: float, move, raise, keep inside the workspace, dock back', () => {
  let l = floatPanel(base(), 'project', { x: 100, y: 80, w: 360, h: 280 });
  assert.equal(l.floats.length, 1);
  assert.ok(whereIs(l, 'project').float);
  assert.ok(!whereIs(l, 'inspector').group.tabs.includes('project'));
  l = floatPanel(l, 'templates', { x: 140, y: 120, w: 300, h: 300 });
  const first = l.floats[0].id;
  l = raiseFloat(l, first);
  assert.equal(l.floats[l.floats.length - 1].id, first);
  l = placeFloat(l, first, { x: 5000, y: -40 });
  l = clampFloats(l, 1200, 700);
  const f = l.floats.find((x) => x.id === first);
  assert.ok(f.x <= 1200 - 120 && f.y >= 0);
  // a window dropped onto a floating window joins its tabs
  const m = movePanel(l, 'media', { kind: 'group', group: f.group.id, zone: 'center' });
  assert.deepEqual(whereIs(m, 'media').group.tabs, ['project', 'media']);
  const d = dockFloat(m, first, 'left');
  assert.equal(d.floats.length, 1);
  assert.deepEqual(d.root.children[0].tabs, ['project', 'media']);
  once(d);
});

test('maximising shows one group alone, and is cleared when that group goes', () => {
  const l = base();
  const g = whereIs(l, 'program').group.id;
  const m = toggleMax(l, g);
  assert.deepEqual(visiblePanels(m), ['program']);
  assert.equal(toggleMax(m, g).max, null);
  assert.equal(removePanel(m, 'program').max, null);
});

test('a stored layout is checked: unknown windows dropped, each kept once, broken parts removed', () => {
  const known = ['program', 'timeline', 'media'];
  const raw = { v: 1, root: { type: 'split', dir: 'col', children: [{ type: 'group', tabs: ['program', 'gone', 'program'], active: 'gone' }, { type: 'group', tabs: ['timeline', 'media'] }, { type: 'split', dir: 'row', children: [] }, 'junk'], sizes: [2, 1, 1, 1] }, floats: [{ group: { type: 'group', tabs: ['media'] }, x: 'a' }], max: 'nope' };
  const l = repair(raw, known);
  once(l);
  assert.deepEqual(panelsOf(l).sort(), ['media', 'program', 'timeline']);
  assert.equal(whereIs(l, 'program').group.active, 'program');
  assert.equal(l.floats.length, 0, 'a float whose only window is already docked goes');
  assert.equal(l.max, null);
  assert.equal(repair({ v: 2 }, known), null);
  assert.equal(repair(null, known), null);
  assert.equal(repair({ v: 1, root: { type: 'group', tabs: ['gone'] }, floats: [] }, known), null);
  const fixed = ensurePanels(l, [{ panel: 'export', near: ['program'] }]);
  assert.ok(panelsOf(fixed).includes('export'));
});

test('normalising flattens and collapses', () => {
  const g1 = group(['a']);
  const g2 = group(['b']);
  const g3 = group(['c']);
  const nested = { v: 1, root: { type: 'split', id: 's1', dir: 'row', sizes: [0.5, 0.5], children: [g1, { type: 'split', id: 's2', dir: 'row', sizes: [0.5, 0.5], children: [g2, g3] }] }, floats: [], max: null };
  const n = normalize(nested);
  assert.equal(n.root.children.length, 3);
  assert.deepEqual(n.root.sizes.map((x) => Math.round(x * 100)), [50, 25, 25]);
  const single = normalize({ v: 1, root: { type: 'split', id: 's', dir: 'col', sizes: [1], children: [g1] }, floats: [], max: null });
  assert.equal(single.root.type, 'group');
});

test('every preset of both editors is valid, holds each window once, and only known windows', () => {
  for (const kind of ['video', 'photo']) {
    const known = panelIds(kind);
    assert.ok(PRESETS[kind].length >= 3, `${kind}: at least three workspaces`);
    for (const p of PRESETS[kind]) {
      const l = p.build();
      once(l);
      sumOk(l.root);
      for (const id of panelsOf(l)) assert.ok(known.includes(id), `${kind}/${p.id}: ${id} is a window of this editor`);
      assert.ok(panelsOf(l).includes('program'), `${kind}/${p.id}: the preview is shown`);
      assert.ok(p.label && !/[a-z]/i.test(p.label), 'an Arabic name');
      // and a stored copy reads back the same
      assert.deepEqual(panelsOf(repair(JSON.parse(JSON.stringify(l)), known)).sort(), panelsOf(l).sort());
    }
    for (const id of known) assert.ok(PANEL_HOMES[id], `${id} has a place to return to`);
  }
});

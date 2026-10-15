// Step 8 of Readiness_Audit.md: role-aware steps, what is new, the closing card of an empty page,
// the pages that had no guide, and the touch words. The engine itself is driven in a real browser
// by qa/help-tours.cjs; here the data and the source it reads are checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, PAGE_SOURCES, SHARED_SOURCES } from '../src/lib/help/registry.ts';

const read = (f) => readFileSync(f, 'utf8');
const classesOf = (sel) => [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
const GROUPS = ['lead', 'maker', 'publisher', 'member'];

test('a role\'s own steps and the news point at elements the page\'s components draw', () => {
  const shared = SHARED_SOURCES.map(read).join('\n');
  let roleSteps = 0;
  let news = 0;
  for (const [key, h] of Object.entries(PAGES)) {
    const src = PAGE_SOURCES[key].map(read).join('\n') + shared;
    for (const [g, steps] of Object.entries(h.onbRole ?? {})) {
      assert.ok(GROUPS.includes(g), `${key}: ${g}`);
      for (const s of steps) {
        roleSteps++;
        assert.ok(s.t && s.b, key);
        for (const c of classesOf(s.sel)) assert.ok(src.includes(c), `${key}: ${s.sel} (.${c})`);
      }
    }
    if (h.news) {
      assert.ok((h.v ?? 0) > 1, `${key}: news needs a version above 1`);
      for (const s of h.news) {
        news++;
        for (const c of classesOf(s.sel)) assert.ok(src.includes(c), `${key}: ${s.sel} (.${c})`);
      }
    }
    if (h.v) assert.ok(Number.isInteger(h.v) && h.v >= 1 && h.v < 30, key);
  }
  assert.ok(roleSteps >= 5, `role steps: ${roleSteps}`);
  assert.ok(news >= 3, `news steps: ${news}`);
});

test('the news key is one the database accepts for a seen page', () => {
  const key = /^[a-z][a-z0-9_-]{0,30}(:[a-z0-9_-]{1,30})?$/;
  for (const [page, h] of Object.entries(PAGES)) if (h.v && h.v > 1) assert.match(`${page}:v${h.v}`, key, page);
});

test('every page that had no guide has one now, in plain words about what is sample and what is real', () => {
  for (const k of ['ideas', 'analytics', 'monitoring', 'admin', 'motion', 'components']) {
    const h = PAGES[k];
    assert.ok(h, k);
    for (const g of GROUPS) assert.ok(h.roles[g], `${k}: ${g}`);
    assert.ok(h.empty && h.empty.length > 10, `${k}: empty`);
  }
  for (const k of ['analytics', 'monitoring']) assert.match(PAGES[k].purpose + PAGES[k].tip, /تجريب/, k);
});

test('the engine says the role, shows what is new once, closes an empty page with a card, and has touch words', () => {
  const g = read('src/lib/kit/guide.ts');
  assert.match(g, /const roleLine = /);
  assert.match(g, /ROLE_GROUP\[me\]/);
  assert.match(g, /newsKey\(page, h\)/);
  assert.match(g, /ما لا يظهر بعد/);
  assert.match(g, /startTour\(page, true\)/, 'after the page had time to draw, the closing card is shown');
  assert.match(g, /pointer: coarse/);
  assert.match(g, /data-gda="doc">دليل الصفحة/, 'the page guide is a button in the guide bar, not only a double click');
  const css = read('src/app/kit.css');
  assert.match(css, /@media \(pointer:coarse\)/);
  assert.match(css, /min-height:44px/);
});

test('no emoji in the new guide words', () => {
  const text = JSON.stringify(['ideas', 'analytics', 'monitoring', 'admin', 'motion', 'components'].map((k) => PAGES[k])) + JSON.stringify(PAGES.settings.news);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});

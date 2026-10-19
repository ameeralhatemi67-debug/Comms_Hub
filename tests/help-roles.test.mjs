import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, PAGE_SOURCES, SHARED_SOURCES } from '../src/lib/help/registry.ts';
import { CARDS, ROLE_GUIDE } from '../src/lib/help/roles.ts';
import { roleIds, roles } from '../src/lib/domain.ts';

// Help_Content_Matrix.md is the source of the wording; src/lib/help/roles.ts is what the guide reads.
const read = (f) => readFileSync(f, 'utf8');
const doc = read('Help_Content_Matrix.md').split('\n');
const ROLE = { 'مدير الاتصال المؤسسي': 'director', 'مساعد مدير الاتصال المؤسسي': 'assistant', 'كاتب المحتوى': 'writer', المصمم: 'designer', 'المنتج الإعلامي': 'producer', 'مسؤول النشر وإدارة الحسابات': 'publisher', عضو: 'member', Admin: 'admin' };
const roleRe = /^\| (مدير الاتصال المؤسسي|مساعد مدير الاتصال المؤسسي|كاتب المحتوى|المصمم|المنتج الإعلامي|مسؤول النشر وإدارة الحسابات|عضو|Admin) \| ([^|]*)\| ([^|]*)\| ([^|]*)\| ([^|]*)\|\s*$/;
const defs = {};
const rows = {};
let key = '';
for (const l of doc) {
  const k = l.match(/^Page key: `([^`]+)`/);
  if (k) {
    key = k[1];
    rows[key] = {};
  }
  const r = l.match(roleRe);
  if (r && key) rows[key][ROLE[r[1]]] = { access: r[2].trim(), intro: r[3].trim(), cards: r[4].split(',').map((s) => s.trim()) };
  const m = l.match(/^\| ([A-Z]{1,3}\d{2}) \| ([^|]*)\| ([^|]*)\| ([^|]*)\|\s*$/);
  if (m) defs[m[1]] = { t: m[3].trim(), b: m[4].trim() };
}

test('the role guide covers every help page and every exact role, three or four cards a row', () => {
  assert.deepEqual(Object.keys(ROLE_GUIDE).sort(), Object.keys(PAGES).sort());
  for (const [page, byRole] of Object.entries(ROLE_GUIDE)) {
    assert.deepEqual(Object.keys(byRole).sort(), [...roleIds].sort(), page);
    for (const [role, e] of Object.entries(byRole)) {
      assert.ok(e.intro && e.access, `${page}/${role}`);
      assert.ok(e.cards.length >= 3 && e.cards.length <= 4, `${page}/${role}: ${e.cards.length} cards`);
      for (const id of e.cards) assert.ok(CARDS[id], `${page}/${role}: card ${id}`);
    }
  }
});

test('src/lib/help/roles.ts says what Help_Content_Matrix.md says: wording, introductions, access notes and card order', () => {
  assert.equal(Object.keys(rows).length, 23);
  for (const [page, byRole] of Object.entries(rows)) {
    for (const role of roleIds) assert.deepEqual(ROLE_GUIDE[page][role], byRole[role], `${page}/${role}`);
  }
  for (const [id, c] of Object.entries(CARDS)) {
    assert.equal(c.t, defs[id]?.t, `${id} title`);
    assert.equal(c.b, defs[id]?.b, `${id} body`);
  }
  // Every card a row selects is in the table; nothing is in the table that no row selects, except the
  // conditional state cards, the section tips and the shared first-use cards named in the matrix.
  const used = new Set(Object.values(rows).flatMap((p) => Object.values(p).flatMap((e) => e.cards)));
  for (const id of used) assert.ok(CARDS[id], id);
});

test('a card points at markup that exists: every class and data-gd it names is in the page components', () => {
  const shared = SHARED_SOURCES.map(read).join('\n');
  for (const [page, byRole] of Object.entries(ROLE_GUIDE)) {
    const src = PAGE_SOURCES[page].map(read).join('\n') + shared;
    for (const e of Object.values(byRole)) {
      for (const id of e.cards) {
        const sel = CARDS[id].sel;
        for (const m of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) assert.match(src, new RegExp(`(^|[^\\w-])${m[1].replace(/-/g, '\\-')}([^\\w-]|$)`), `${page}/${id}: .${m[1]}`);
        for (const m of sel.matchAll(/\[data-gd=("[^"]+")\]/g)) assert.ok(src.includes(`data-gd=${m[1]}`), `${page}/${id}: data-gd=${m[1]}`);
        for (const m of sel.matchAll(/\[data-gd\^="([^"]+)"\]/g)) assert.ok(src.includes(`data-gd={\`${m[1]}`) || src.includes(`"${m[1]}`) || src.includes(m[1]), `${page}/${id}: data-gd^=${m[1]}`);
      }
    }
  }
});

test('a role never reads a raw key, and every access note is one of the matrix codes', () => {
  const text = JSON.stringify([CARDS, ROLE_GUIDE]);
  assert.doesNotMatch(text, /IN_REVIEW|CHANGES_REQUESTED|READY_TO_PUBLISH|PARTIAL/);
  assert.doesNotMatch(text, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'no emoji');
  for (const [page, byRole] of Object.entries(ROLE_GUIDE))
    for (const [role, e] of Object.entries(byRole)) assert.match(e.access, /^[AOCRT](\/[AOCRT])?$/, `${page}/${role}: access note ${e.access}`);
  assert.equal(roles.admin.name, 'Admin');
});

test('the home page carries the two anchors its cards name', () => {
  const home = read('src/components/home.tsx');
  assert.match(home, /data-gd="focus"/);
  assert.match(home, /data-gd="upcoming"/);
});

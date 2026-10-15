// Action_Plan.md B4: who sees which page, by role, written down as an expectation and held against the
// rules. The expectation below is the table kept in MVP_draft.md ("Access by role"); a change to
// src/lib/access.ts, the role defaults or the capability templates that moves a page to a role the table
// does not name fails here, and is then either a mistake or a decision to record in progress.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessMatrix, MATRIX_ROLES } from '../src/lib/access-matrix.ts';
import { menuEntries, menuFor, canOpen, defaultPages } from '../src/lib/access.ts';
import { resolve, installedDefault } from '../src/lib/permissions.ts';

const m = accessMatrix();
const byRole = Object.fromEntries(m.roles.map((r) => [r.role, r]));
const order = menuEntries.map((e) => (e.href === '/' ? '' : e.href.slice(1)));
const inOrder = (set) => order.filter((id) => set.includes(id));

// Pages every role opens by default. «settings» is the administrator's alone (Action_Plan.md B4b):
// another person has it only with the page grant or by holding «settings.view» or «settings.manage».
const COMMON = ['', 'work', 'approvals', 'calendar', 'projects', 'requests', 'media', 'tasks', 'activity', 'analytics', 'motion', 'mail', 'ideas'];
const EXPECTED_MENU = {
  admin: [...COMMON, 'settings', 'channels', 'accounts'],
  director: [...COMMON, 'create', 'channels'],
  assistant: [...COMMON, 'create', 'channels'],
  writer: [...COMMON, 'create'],
  designer: [...COMMON, 'create'],
  producer: [...COMMON, 'create'],
  publisher: [...COMMON, 'channels'],
  member: [...COMMON, 'create'],
};

test('the sidebar each role starts with is exactly the written table', () => {
  assert.deepEqual(Object.keys(byRole).sort(), [...MATRIX_ROLES].sort());
  for (const role of MATRIX_ROLES) assert.deepEqual(byRole[role].menu, inOrder(EXPECTED_MENU[role]), role);
});

test('by address a role opens its menu and its own page; only the administrator opens the rest', () => {
  for (const role of MATRIX_ROLES) {
    const want = new Set([...EXPECTED_MENU[role], 'account']);
    if (role === 'admin') want.add('create'); // opens it by address, never offered it in the menu
    assert.deepEqual([...byRole[role].open].sort(), [...want].sort(), role);
  }
});

test('«الحسابات» and «حسابات المنصات» are not given to the wrong roles', () => {
  for (const role of MATRIX_ROLES) {
    assert.equal(byRole[role].menu.includes('accounts'), role === 'admin', `${role}: accounts`);
    assert.equal(byRole[role].menu.includes('channels'), ['admin', 'director', 'assistant', 'publisher'].includes(role), `${role}: channels`);
  }
  // «حسابات المنصات» goes with «الموافقات والنشر»: without that page the entry goes.
  assert.equal(canOpen({ role: 'publisher', pages: ['work'], caps: [] }, 'channels'), false);
});

test('creating is for the roles that create, and a page grant cannot give it to the others', () => {
  for (const role of ['admin', 'publisher']) assert.equal(byRole[role].menu.includes('create'), false, role);
  assert.equal(canOpen({ role: 'publisher', pages: [...defaultPages('publisher'), 'create'], caps: [] }, 'create'), false);
});

test("an administrator viewing as a role sees that role's creating and accounts entries", () => {
  for (const [role, menu] of Object.entries(m.adminViewAs)) {
    assert.equal(menu.includes('create'), !['admin', 'publisher'].includes(role), `${role}: create`);
    assert.equal(menu.includes('accounts'), ['admin', 'director', 'assistant'].includes(role), `${role}: accounts`);
    assert.equal(menu.includes('settings') && menu.includes('channels'), true, `${role}: the administrator still opens every page`);
  }
});

test('the whole log and the team panel are for the administrator, the director and the assistant', () => {
  for (const role of MATRIX_ROLES) assert.equal(byRole[role].activity, ['admin', 'director', 'assistant'].includes(role) ? 'whole' : 'own', role);
});

test("the capabilities held by default are the administrator's, the leaders' and the publisher's, and nobody else's", () => {
  const holders = Object.fromEntries(m.capabilities.map((c) => [c.key, c.heldBy]));
  assert.deepEqual(holders['accounts.view'], ['admin']);
  for (const k of ['settings.view', 'settings.manage', 'storage.manage', 'storage.migrate', 'backups.run', 'backups.restore', 'platforms.manage', 'integrations.secrets'])
    assert.deepEqual(holders[k], ['admin'], k);
  assert.deepEqual(holders['work.publish'], ['admin', 'publisher']);
  assert.deepEqual(holders['work.approve'], ['admin', 'director', 'assistant']);
  assert.deepEqual(holders['urgency.3'], ['admin', 'director', 'assistant']);
  assert.deepEqual(holders['whatsapp.push'], [], 'nobody holds the WhatsApp push by default (D-13)');
});

test('«الإعدادات» is the administrator\'s by default, and opens for others only with the page grant or a settings capability', () => {
  for (const role of MATRIX_ROLES) assert.equal(defaultPages(role).includes('settings'), role === 'admin', role);
  const writer = { role: 'writer', pages: defaultPages('writer'), caps: [] };
  assert.equal(canOpen(writer, 'settings'), false);
  assert.equal(menuFor(writer).some((e) => e.href === '/settings'), false);
  // the page grant still opens it
  assert.equal(canOpen({ ...writer, pages: [...writer.pages, 'settings'] }, 'settings'), true);
  // so does either capability, in the page guard and in the menu (read live)
  for (const cap of ['settings.view', 'settings.manage']) {
    assert.equal(canOpen({ ...writer, caps: [cap] }, 'settings'), true, cap);
    assert.equal(menuFor(writer, { hasCap: (k) => k === cap }).some((e) => e.href === '/settings'), true, cap);
  }
  // a storage capability alone does not open the page (the owner named settings.view and settings.manage)
  assert.equal(canOpen({ ...writer, caps: ['storage.manage'] }, 'settings'), false);
});

test('the member creates: «إنشاء» is held by the member in the permissions list as in the menu', () => {
  assert.equal(resolve({ role: 'member', pages: ['create'], templates: installedDefault, grants: [] }, 'page.create', 0).ok, true);
  assert.equal(resolve({ role: 'publisher', pages: ['create'], templates: installedDefault, grants: [] }, 'page.create', 0).ok, false);
  assert.equal(byRole.member.menu.includes('create'), true);
  const sql = readFileSync('supabase/migrations/20261015160000_member_creates.sql', 'utf8');
  assert.match(sql, /'designer'',''producer''\)'/);
  assert.match(sql, /'perm_eval', 'grant_capability', 'request_capability'/);
});

test('the shell draws its menu from menuFor and has an icon for every entry', () => {
  const shell = readFileSync('src/components/shell.tsx', 'utf8');
  assert.match(shell, /menuFor\(account, \{ viewAs: state\.role, hasCap: caps\.has \}\)/);
  assert.doesNotMatch(shell, /canOpen\(/);
  for (const e of menuEntries) assert.ok(shell.includes(`'${e.href}':`), `icon for ${e.href}`);
  const own = { role: 'member', pages: defaultPages('member'), caps: [] };
  assert.deepEqual(menuFor(own).map((e) => e.href), menuFor(own, { viewAs: 'member' }).map((e) => e.href));
});
